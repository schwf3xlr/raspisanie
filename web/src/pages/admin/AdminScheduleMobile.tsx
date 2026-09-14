import { useEffect, useMemo, useState } from 'react';
import { adminApi, type AdminDayResponse, type AdminDictionaries, type AdminGroup, type AdminOverride, type AdminTemplateLesson } from '../../lib/admin-api';
import { confirmDialog } from '../../lib/dialog';
import { addDays, fmtDate, fmtWeekLabel, fromISODate, isSameDate, toISODate } from '../../lib/time';
import { DAY_SHORT } from '../../lib/types';
import { DictSelect } from './ScheduleGrid';

interface Props {
  monday: Date;
  dateIso: string;
  data: AdminDayResponse;
  dicts: AdminDictionaries | null;
  templateByKey: Map<string, AdminTemplateLesson>;
  overrideByKey: Map<string, AdminOverride>;
  distantAllDay: Set<string>;
  distantByLesson: Map<string, string | null>;
  isWholeSchoolDistant: boolean;
  numbers: number[];
  timeFor: (n: number) => { timeStart: string; timeEnd: string };
  onSetMonday: (d: Date) => void;
  onSetDate: (iso: string) => void;
  onRefresh: () => Promise<void>;
  onOpenWholeSchool: () => void;
  onOpenDayBells: () => void;
  onPublish: () => void | Promise<void>;
  onUnpublish: () => Promise<void>;
  onPublishWeek: () => void | Promise<void>;
}

export default function AdminScheduleMobile(p: Props) {
  const [activeClass, setActiveClass] = useState<string>(p.data.classes[0] ?? '');
  const [editing, setEditing] = useState<{ number: number } | null>(null);

  const today = new Date();
  const workdays = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(p.monday, i)), [p.monday]);

  const setClass = (c: string) => setActiveClass(c);

  // Конфликты: teacherId и roomId → список классов, где ресурс занят в этом номере урока.
  const conflictInfo = useMemo(() => {
    const byTeacher = new Map<string, string[]>(); // key: "number::teacherId" -> classes
    const byRoom = new Map<string, string[]>();    // key: "number::roomId"    -> classes
    for (const n of p.numbers) {
      for (const c of p.data.classes) {
        const override = p.overrideByKey.get(`${c}::${n}`);
        const tpl = p.templateByKey.get(`${c}::${n}`);
        const src = override ?? tpl;
        if (!src || override?.isCancelled) continue;
        const seenT = new Set<number>();
        const seenR = new Set<number>();
        for (const g of src.groups) {
          if (g.teacherId != null && !seenT.has(g.teacherId)) {
            seenT.add(g.teacherId);
            const key = `${n}::${g.teacherId}`;
            const arr = byTeacher.get(key) ?? [];
            arr.push(c);
            byTeacher.set(key, arr);
          }
          if (g.roomId != null && !seenR.has(g.roomId)) {
            seenR.add(g.roomId);
            const key = `${n}::${g.roomId}`;
            const arr = byRoom.get(key) ?? [];
            arr.push(c);
            byRoom.set(key, arr);
          }
        }
      }
    }
    const conflictCells = new Map<string, 'teacher' | 'room' | 'both'>();
    const teacherConflicts: Array<{ number: number; teacher: string; classes: string[] }> = [];
    const roomConflicts: Array<{ number: number; room: string; classes: string[] }> = [];

    const mark = (cell: string, kind: 'teacher' | 'room') => {
      const cur = conflictCells.get(cell);
      if (!cur) conflictCells.set(cell, kind);
      else if (cur !== kind) conflictCells.set(cell, 'both');
    };

    for (const [key, classes] of byTeacher) {
      if (classes.length < 2) continue;
      const [nStr, idStr] = key.split('::');
      const teacher = p.dicts?.teachers.find(t => t.id === Number(idStr))?.shortName ?? 'Учитель';
      teacherConflicts.push({ number: Number(nStr), teacher, classes });
      for (const c of classes) mark(`${c}::${nStr}`, 'teacher');
    }
    for (const [key, classes] of byRoom) {
      if (classes.length < 2) continue;
      const [nStr, idStr] = key.split('::');
      const room = p.dicts?.rooms.find(r => r.id === Number(idStr))?.name ?? 'Кабинет';
      roomConflicts.push({ number: Number(nStr), room, classes });
      for (const c of classes) mark(`${c}::${nStr}`, 'room');
    }
    return { conflictCells, teacherConflicts, roomConflicts };
  }, [p.numbers, p.data.classes, p.overrideByKey, p.templateByKey, p.dicts]);

  const activeClassConflicts = useMemo(
    () => conflictInfo.teacherConflicts.filter(c => c.classes.includes(activeClass)),
    [conflictInfo.teacherConflicts, activeClass]
  );
  const activeClassRoomConflicts = useMemo(
    () => conflictInfo.roomConflicts.filter(c => c.classes.includes(activeClass)),
    [conflictInfo.roomConflicts, activeClass]
  );

  const lessonsForClass = useMemo(() => {
    const rows: Array<{
      number: number;
      timeStart: string;
      timeEnd: string;
      groups: AdminGroup[];
      fromOverride: boolean;
      isCancelled: boolean;
      isDistant: boolean;
      conflict: 'teacher' | 'room' | 'both' | null;
    }> = [];
    for (const n of p.numbers) {
      const override = p.overrideByKey.get(`${activeClass}::${n}`);
      const tpl = p.templateByKey.get(`${activeClass}::${n}`);
      const source = override ?? tpl;
      const t = p.timeFor(n);
      const isDistant = p.distantAllDay.has(activeClass) || p.distantByLesson.has(`${activeClass}::${n}`);
      rows.push({
        number: n,
        timeStart: source?.timeStart ?? t.timeStart,
        timeEnd: source?.timeEnd ?? t.timeEnd,
        groups: source?.groups ?? [],
        fromOverride: !!override,
        isCancelled: !!override?.isCancelled,
        isDistant,
        conflict: conflictInfo.conflictCells.get(`${activeClass}::${n}`) ?? null,
      });
    }
    return rows;
  }, [activeClass, p.numbers, p.overrideByKey, p.templateByKey, p.distantAllDay, p.distantByLesson, p.timeFor, conflictInfo.conflictCells]);

  const editingSource = editing
    ? (p.overrideByKey.get(`${activeClass}::${editing.number}`) ?? p.templateByKey.get(`${activeClass}::${editing.number}`) ?? null)
    : null;
  const editingIsOverride = editing ? p.overrideByKey.has(`${activeClass}::${editing.number}`) : false;
  const editingIsDistant = editing ? p.distantByLesson.has(`${activeClass}::${editing.number}`) : false;

  return (
    <div className="md:hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h1 className="font-serif text-[28px] -tracking-[.02em] leading-none font-normal">Расписание</h1>
            <p className="text-ink-2-light dark:text-ink-2-dark text-[13px] mt-1">
              {p.data.day}, {fmtDate(fromISODate(p.dateIso))}
            </p>
          </div>
          <PublishBadgeMobile published={p.data.published} />
        </div>

        {/* Week nav */}
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => p.onSetMonday(addDays(p.monday, -7))} className="w-9 h-9 rounded-xl border border-line-light dark:border-line-dark grid place-items-center text-ink-2-light dark:text-ink-2-dark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <span className="text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark tabular-nums">
            {fmtWeekLabel(p.monday)}
          </span>
          <button onClick={() => p.onSetMonday(addDays(p.monday, 7))} className="w-9 h-9 rounded-xl border border-line-light dark:border-line-dark grid place-items-center text-ink-2-light dark:text-ink-2-dark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6"/></svg>
          </button>
        </div>

        {/* Day chips */}
        <div className="flex gap-1.5 -mx-4 px-4 pb-1.5 overflow-x-auto no-scrollbar mb-3">
          {workdays.map((d, i) => {
            const iso = toISODate(d);
            const short = Object.values(DAY_SHORT)[i]!;
            const on = iso === p.dateIso;
            const isToday = isSameDate(d, today);
            return (
              <button key={iso} onClick={() => p.onSetDate(iso)}
                className={[
                  'shrink-0 min-w-[52px] px-3 py-2 rounded-2xl border text-center transition-colors',
                  on ? 'bg-ink-light text-bg-light border-ink-light dark:bg-ink-dark dark:text-bg-dark dark:border-ink-dark'
                     : 'text-ink-2-light dark:text-ink-2-dark border-line-light dark:border-line-dark',
                ].join(' ')}>
                <div className={['text-[10.5px] font-bold uppercase tracking-wider', on ? 'opacity-70' : 'opacity-60'].join(' ')}>{short}</div>
                <div className="font-serif text-[18px] font-medium leading-none tabular-nums mt-0.5">{d.getDate()}</div>
                {isToday && <div className={['mx-auto mt-0.5 w-1 h-1 rounded-full', on ? 'bg-white' : 'bg-accent dark:bg-accent-dark'].join(' ')} />}
              </button>
            );
          })}
        </div>

        {/* Action buttons */}
        <div className="grid grid-cols-2 gap-2 mb-3">
          {p.data.published ? (
            <button onClick={p.onUnpublish} className="col-span-2 py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark">
              Отозвать публикацию
            </button>
          ) : (
            <button onClick={p.onPublish} className="col-span-2 py-2.5 rounded-xl bg-accent dark:bg-accent-dark text-white text-[13px] font-semibold">
              Опубликовать этот день
            </button>
          )}
          <button onClick={p.onPublishWeek} className="py-2 rounded-xl border border-line-light dark:border-line-dark text-[12.5px] font-semibold text-ink-2-light dark:text-ink-2-dark">
            Опубликовать неделю
          </button>
          <button onClick={p.onOpenWholeSchool}
            className={[
              'py-2 rounded-xl border text-[12.5px] font-semibold',
              p.isWholeSchoolDistant
                ? 'bg-distant-soft dark:bg-distant-soft-dark text-distant dark:text-distant-dark border-distant/30 dark:border-distant-dark/30'
                : 'border-line-light dark:border-line-dark text-ink-2-light dark:text-ink-2-dark',
            ].join(' ')}>
            {p.isWholeSchoolDistant ? 'Вся школа на дистанте' : 'Дистант всей школы'}
          </button>
          <button onClick={p.onOpenDayBells}
            className="col-span-2 py-2 rounded-xl border border-line-light dark:border-line-dark text-[12.5px] font-semibold text-ink-2-light dark:text-ink-2-dark">
            Звонки на этот день
          </button>
        </div>
      </div>

      {/* Class picker (horizontal scroll) */}
      <div className="sticky top-14 z-20 bg-bg-light dark:bg-bg-dark border-b border-line-light dark:border-line-dark px-4 py-2.5 shadow-[0_4px_8px_-4px_rgba(0,0,0,.08)]">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {p.data.classes.map(c => (
            <button key={c} onClick={() => setClass(c)}
              className={[
                'shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold tabular-nums transition-colors',
                activeClass === c
                  ? 'bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark'
                  : 'bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-ink-2-light dark:text-ink-2-dark',
              ].join(' ')}>
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Conflict banners */}
      {activeClassConflicts.length > 0 && (
        <div className="mx-4 mt-4 bg-red-50 dark:bg-red-950/40 border border-red-300/60 dark:border-red-900/60 rounded-2xl p-3.5">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold text-[13px] mb-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"><path d="M12 9v4M12 17h.01M4.9 20.5h14.2a2 2 0 001.75-2.98l-7.1-12.5a2 2 0 00-3.5 0L3.16 17.52A2 2 0 004.9 20.5z"/></svg>
            Конфликт учителя
          </div>
          <ul className="text-[12.5px] text-red-800 dark:text-red-300 space-y-1">
            {activeClassConflicts.map((c, i) => (
              <li key={i}>
                <b>{c.number}-й урок:</b> {c.teacher} ведёт в классах {c.classes.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}
      {activeClassRoomConflicts.length > 0 && (
        <div className="mx-4 mt-3 bg-orange-50 dark:bg-orange-950/30 border border-orange-300/60 dark:border-orange-900/60 rounded-2xl p-3.5">
          <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 font-semibold text-[13px] mb-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 20V9"/></svg>
            Конфликт кабинета
          </div>
          <ul className="text-[12.5px] text-orange-800 dark:text-orange-300 space-y-1">
            {activeClassRoomConflicts.map((c, i) => (
              <li key={i}>
                <b>{c.number}-й урок:</b> кабинет {c.room} занят в классах {c.classes.join(', ')}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Lessons list */}
      <div className="px-4 py-4 pb-24 space-y-2">
        {lessonsForClass.map(l => (
          <button key={l.number} onClick={() => setEditing({ number: l.number })}
            className={[
              'w-full text-left rounded-2xl border p-3 flex items-stretch gap-3 transition-colors relative',
              l.conflict === 'teacher' || l.conflict === 'both'
                ? 'bg-red-50 dark:bg-red-950/30 border-red-400/70 dark:border-red-800/70 ring-2 ring-red-300/40 dark:ring-red-900/40'
                : l.conflict === 'room'
                  ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-400/70 dark:border-orange-800/70 ring-2 ring-orange-300/40 dark:ring-orange-900/40'
                  : l.isDistant
                    ? 'bg-distant-soft dark:bg-distant-soft-dark border-distant/20 dark:border-distant-dark/25'
                    : l.fromOverride
                      ? 'bg-accent-soft/50 dark:bg-accent-soft-dark/50 border-accent/25 dark:border-accent-dark/30'
                      : 'bg-panel-light dark:bg-panel-dark border-line-light dark:border-line-dark',
            ].join(' ')}>
            <div className="w-11 shrink-0 flex flex-col items-center justify-center text-center border-r border-line-light dark:border-line-dark pr-3">
              <div className="font-serif text-[22px] font-medium leading-none tabular-nums">{l.number}</div>
              <div className="text-[10.5px] text-ink-3-light dark:text-ink-3-dark tabular-nums font-medium mt-1">
                {l.timeStart}
                <br />{l.timeEnd}
              </div>
            </div>
            <div className="flex-1 min-w-0 py-0.5">
              {l.groups.length === 0 ? (
                <div className="text-ink-3-light dark:text-ink-3-dark text-[13px] italic">
                  {l.isCancelled ? 'Урок отменён' : '+ Добавить'}
                </div>
              ) : (
                l.groups.map((g, i) => (
                  <div key={i} className={i > 0 ? 'mt-1.5 pt-1.5 border-t border-dashed border-line-light dark:border-line-dark' : ''}>
                    <div className="text-[14.5px] font-semibold leading-tight flex items-center gap-1.5">
                      <span className="min-w-0 flex-1 truncate">{lookupSubject(p.dicts, g.subjectId)}</span>
                      {(l.conflict === 'teacher' || l.conflict === 'both') && i === 0 && <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950/60 px-1 py-0.5 rounded">Учит.</span>}
                      {l.conflict === 'room' && i === 0 && <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400 bg-orange-100 dark:bg-orange-950/60 px-1 py-0.5 rounded">Каб.</span>}
                      {l.isDistant && i === 0 && !l.conflict && <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-distant dark:text-distant-dark bg-distant/10 dark:bg-distant-dark/20 px-1 py-0.5 rounded">Дист</span>}
                      {l.fromOverride && !l.isDistant && !l.conflict && i === 0 && <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider text-accent dark:text-accent-dark bg-accent/10 dark:bg-accent-dark/20 px-1 py-0.5 rounded">Замена</span>}
                    </div>
                    <div className="text-[12px] text-ink-2-light dark:text-ink-2-dark leading-tight mt-0.5">
                      {lookupTeacher(p.dicts, g.teacherId)}
                      {lookupRoom(p.dicts, g.roomId) && <span className="ml-1.5 font-semibold text-ink-light dark:text-ink-dark tabular-nums">{lookupRoom(p.dicts, g.roomId)}</span>}
                    </div>
                  </div>
                ))
              )}
            </div>
          </button>
        ))}
      </div>

      {editing && p.dicts && (
        <MobileEditor
          date={p.dateIso}
          className={activeClass}
          number={editing.number}
          time={p.timeFor(editing.number)}
          isOverride={editingIsOverride}
          isDistant={editingIsDistant}
          isWholeDayDistant={p.distantAllDay.has(activeClass)}
          groups={editingSource?.groups ?? []}
          dicts={p.dicts}
          onClose={() => setEditing(null)}
          onSaved={async () => { await p.onRefresh(); }}
        />
      )}

    </div>
  );
}

function lookupSubject(d: AdminDictionaries | null, id: number): string {
  return d?.subjects.find(s => s.id === id)?.name ?? '';
}
function lookupTeacher(d: AdminDictionaries | null, id: number | null): string {
  if (id == null) return '';
  return d?.teachers.find(t => t.id === id)?.shortName ?? '';
}
function lookupRoom(d: AdminDictionaries | null, id: number | null): string {
  if (id == null) return '';
  return d?.rooms.find(r => r.id === id)?.name ?? '';
}

function PublishBadgeMobile({ published }: { published: boolean }) {
  return (
    <span className={['inline-flex items-center gap-1 text-[10.5px] font-bold tracking-wider uppercase px-2 py-1 rounded-full shrink-0',
      published ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400'
                : 'bg-line-light dark:bg-line-dark text-ink-2-light dark:text-ink-2-dark'].join(' ')}>
      <span className={`w-1.5 h-1.5 rounded-full ${published ? 'bg-green-500' : 'bg-ink-3-light dark:bg-ink-3-dark'}`} />
      {published ? 'Опубл.' : 'Черновик'}
    </span>
  );
}

// ---------- Mobile lesson editor (bottom-sheet) ----------
function MobileEditor({ date, className, number, time, isOverride, isDistant, isWholeDayDistant, groups, dicts, onClose, onSaved }: {
  date: string; className: string; number: number;
  time: { timeStart: string; timeEnd: string };
  isOverride: boolean; isDistant: boolean; isWholeDayDistant: boolean;
  groups: AdminGroup[]; dicts: AdminDictionaries;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [editGroups, setEditGroups] = useState<AdminGroup[]>(groups.length ? groups : [{ subjectId: 0, teacherId: null, roomId: null }]);
  const [distantNote, setDistantNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEditGroups(groups.length ? groups : [{ subjectId: 0, teacherId: null, roomId: null }]);
    setDistantNote('');
  }, [date, className, number, groups]);

  const subjOpts = dicts.subjects.map(s => ({ id: s.id, label: s.name }));
  const teachOpts = dicts.teachers.map(t => ({ id: t.id, label: t.shortName }));
  const roomOpts = dicts.rooms.map(r => ({ id: r.id, label: r.name }));

  const save = async () => {
    const clean = editGroups.filter(g => g.subjectId > 0);
    setBusy(true);
    try { await adminApi.saveOverride({ date, className, number, groups: clean }); await onSaved(); onClose(); }
    finally { setBusy(false); }
  };
  const resetToTemplate = async () => {
    const ok = await confirmDialog({ title: 'Вернуть к стандарту?', message: 'Замена на эту дату будет удалена.', confirmText: 'Вернуть' });
    if (!ok) return;
    setBusy(true);
    try { await adminApi.clearOverride({ date, className, number }); await onSaved(); onClose(); }
    finally { setBusy(false); }
  };
  const toggleDistant = async () => {
    setBusy(true);
    try {
      if (isDistant) await adminApi.clearDistant({ date, className, lessonNumber: number });
      else await adminApi.setDistant({ date, className, lessonNumber: number, note: distantNote || null });
      await onSaved();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full bg-bg-light dark:bg-bg-dark rounded-t-3xl max-h-[92vh] overflow-y-auto animate-[slideUp_.2s_ease-out]">
        <div className="pt-3 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-line-light dark:bg-line-dark" />
        </div>
        <div className="px-6 pt-4 pb-4 border-b border-line-light dark:border-line-dark">
          <div className="text-[11px] font-bold tracking-[.1em] uppercase text-ink-3-light dark:text-ink-3-dark mb-1.5">
            Класс {className} · {fmtDate(fromISODate(date))}
          </div>
          <h2 className="font-serif text-[24px] -tracking-[.01em] font-normal leading-tight">{number}-й урок</h2>
          <div className="text-[12.5px] text-ink-3-light dark:text-ink-3-dark tabular-nums mt-1">{time.timeStart} - {time.timeEnd}</div>
          {isOverride && <div className="mt-2 inline-flex items-center gap-1.5 bg-accent-soft dark:bg-accent-soft-dark text-accent dark:text-accent-dark text-[10.5px] font-bold tracking-[.06em] uppercase px-2 py-1 rounded-full">Замена</div>}
        </div>

        <div className="px-6 py-5 space-y-4">
          {editGroups.map((g, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-bold tracking-[.06em] uppercase text-ink-3-light dark:text-ink-3-dark">
                  {editGroups.length > 1 ? `Группа ${i + 1}` : 'Предмет'}
                </div>
                {editGroups.length > 1 && (
                  <button onClick={() => setEditGroups(gs => gs.filter((_, idx) => idx !== i))} className="text-[11.5px] text-ink-3-light dark:text-ink-3-dark hover:text-red-500 font-medium">убрать</button>
                )}
              </div>
              <DictSelect value={g.subjectId || null} options={subjOpts} placeholder="Предмет"
                onChange={id => setEditGroups(gs => gs.map((x, idx) => idx === i ? { ...x, subjectId: id ?? 0 } : x))} />
              <DictSelect value={g.teacherId} options={teachOpts} placeholder="Учитель" allowEmpty
                onChange={id => setEditGroups(gs => gs.map((x, idx) => idx === i ? { ...x, teacherId: id } : x))} />
              <DictSelect value={g.roomId} options={roomOpts} placeholder="Кабинет" allowEmpty
                onChange={id => setEditGroups(gs => gs.map((x, idx) => idx === i ? { ...x, roomId: id } : x))} />
            </div>
          ))}
          {editGroups.length < 3 && (
            <button onClick={() => setEditGroups(gs => [...gs, { subjectId: 0, teacherId: null, roomId: null }])}
              className="w-full py-2.5 rounded-lg border border-dashed border-line-light dark:border-line-dark text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark">
              + группа
            </button>
          )}
        </div>

        <div className="px-6 pb-2 space-y-2">
          <button onClick={save} disabled={busy} className="w-full py-3 rounded-xl bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[15px] disabled:opacity-50">
            {busy ? 'Сохраняем…' : isOverride ? 'Обновить' : 'Сохранить'}
          </button>
          {isOverride && (
            <button onClick={resetToTemplate} className="w-full py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13.5px] font-semibold">
              Вернуть к стандарту
            </button>
          )}
        </div>

        <div className="px-6 py-4 border-t border-line-light dark:border-line-dark">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-[13.5px] font-semibold text-distant dark:text-distant-dark">Урок дистанционно</div>
              <div className="text-[11.5px] text-ink-3-light dark:text-ink-3-dark mt-0.5">
                {isWholeDayDistant ? 'Весь день у класса дистант' : 'Отдельно этот урок'}
              </div>
            </div>
            <button disabled={isWholeDayDistant || busy} onClick={toggleDistant}
              className={['relative w-11 h-6 rounded-full transition-colors disabled:opacity-40',
                isDistant ? 'bg-distant dark:bg-distant-dark' : 'bg-line-light dark:bg-line-dark'].join(' ')}>
              <span className={['absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', isDistant ? 'left-[22px]' : 'left-0.5'].join(' ')} />
            </button>
          </div>
          {!isDistant && !isWholeDayDistant && (
            <input type="text" value={distantNote} onChange={e => setDistantNote(e.target.value)} placeholder="Заметка при включении"
              className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[13px]" />
          )}
        </div>

        <div className="px-6 py-4">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark font-semibold text-[13.5px]">
            Закрыть
          </button>
        </div>
        <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
      </div>
    </div>
  );
}
