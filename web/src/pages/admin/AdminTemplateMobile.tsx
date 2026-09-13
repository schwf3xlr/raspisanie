import { useEffect, useMemo, useState } from 'react';
import { adminApi, type AdminDictionaries, type AdminGroup, type AdminTemplateResponse } from '../../lib/admin-api';
import { confirmDialog } from '../../lib/dialog';
import { DAYS, type DayName } from '../../lib/types';
import { DictSelect } from './ScheduleGrid';

interface Props {
  day: DayName;
  data: AdminTemplateResponse;
  dicts: AdminDictionaries | null;
  onSetDay: (d: DayName) => void;
  onRefresh: () => Promise<void>;
}

export default function AdminTemplateMobile({ day, data, dicts, onSetDay, onRefresh }: Props) {
  const [activeClass, setActiveClass] = useState<string>(data.classes[0] ?? '');
  const [editing, setEditing] = useState<{ number: number } | null>(null);

  const byKey = useMemo(() => {
    const m = new Map<string, AdminGroup[]>();
    for (const l of data.lessons) m.set(`${l.className}::${l.number}`, l.groups);
    return m;
  }, [data.lessons]);

  const maxNumber = useMemo(() => {
    return Math.max(8, ...data.lessons.map(l => l.number), ...data.timeSlots.map(t => t.number));
  }, [data.lessons, data.timeSlots]);
  const numbers = useMemo(() => Array.from({ length: maxNumber }, (_, i) => i + 1), [maxNumber]);

  const timeFor = (n: number) => {
    const t = data.timeSlots.find(x => x.number === n);
    return { timeStart: t?.timeStart ?? '', timeEnd: t?.timeEnd ?? '' };
  };

  // Конфликты
  const conflictInfo = useMemo(() => {
    const byLessonTeacher = new Map<string, string[]>();
    for (const n of numbers) {
      for (const c of data.classes) {
        const groups = byKey.get(`${c}::${n}`) ?? [];
        const seen = new Set<number>();
        for (const g of groups) {
          if (g.teacherId == null || seen.has(g.teacherId)) continue;
          seen.add(g.teacherId);
          const key = `${n}::${g.teacherId}`;
          const arr = byLessonTeacher.get(key) ?? [];
          arr.push(c);
          byLessonTeacher.set(key, arr);
        }
      }
    }
    const conflictCells = new Set<string>();
    const conflicts: Array<{ number: number; teacher: string; classes: string[] }> = [];
    for (const [key, classes] of byLessonTeacher) {
      if (classes.length < 2) continue;
      const [nStr, tIdStr] = key.split('::');
      const teacher = dicts?.teachers.find(t => t.id === Number(tIdStr))?.shortName ?? 'Учитель';
      conflicts.push({ number: Number(nStr), teacher, classes });
      for (const c of classes) conflictCells.add(`${c}::${nStr}`);
    }
    return { conflictCells, conflicts };
  }, [numbers, data.classes, byKey, dicts]);

  const activeClassConflicts = useMemo(
    () => conflictInfo.conflicts.filter(c => c.classes.includes(activeClass)),
    [conflictInfo.conflicts, activeClass]
  );

  const lessonsForClass = useMemo(() => {
    return numbers.map(n => ({
      number: n,
      ...timeFor(n),
      groups: byKey.get(`${activeClass}::${n}`) ?? [],
      isConflict: conflictInfo.conflictCells.has(`${activeClass}::${n}`),
    }));
  }, [numbers, activeClass, byKey, conflictInfo.conflictCells]); // eslint-disable-line react-hooks/exhaustive-deps

  const editingGroups = editing ? byKey.get(`${activeClass}::${editing.number}`) ?? [] : [];

  return (
    <div className="md:hidden">
      <div className="bg-yellow-100 dark:bg-yellow-950/40 text-yellow-900 dark:text-yellow-200 border-b border-yellow-300/50 dark:border-yellow-900/50 px-4 py-2.5 text-[12.5px] font-semibold flex items-start gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-0.5"><path d="M12 9v4M12 17h.01M4.9 20.5h14.2a2 2 0 001.75-2.98l-7.1-12.5a2 2 0 00-3.5 0L3.16 17.52A2 2 0 004.9 20.5z"/></svg>
        <span>Стандартное расписание. Изменения применятся ко всем будущим неделям без замены.</span>
      </div>

      <div className="px-4 pt-4 pb-3 bg-[#faf6ee] dark:bg-[#141210]">
        <h1 className="font-serif text-[26px] -tracking-[.02em] leading-none font-normal">Стандартное расписание</h1>
        <p className="text-ink-2-light dark:text-ink-2-dark text-[13px] mt-1.5 mb-3">
          Меняй только когда меняется постоянное.
        </p>
        <div className="flex gap-1 bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-full p-1 overflow-x-auto no-scrollbar">
          {DAYS.map(d => (
            <button key={d} onClick={() => onSetDay(d)}
              className={[
                'shrink-0 px-3.5 py-1.5 rounded-full text-[13px] font-semibold transition-colors',
                day === d ? 'bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark' : 'text-ink-2-light dark:text-ink-2-dark',
              ].join(' ')}
            >{d}</button>
          ))}
        </div>
      </div>

      <div className="sticky top-14 z-20 bg-[#faf6ee] dark:bg-[#141210] border-b border-line-light dark:border-line-dark px-4 py-2.5 shadow-[0_4px_8px_-4px_rgba(0,0,0,.08)]">
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
          {data.classes.map(c => (
            <button key={c} onClick={() => setActiveClass(c)}
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

      <div className="px-4 py-4 pb-24 space-y-2 bg-[#faf6ee] dark:bg-[#141210] min-h-[calc(100vh-14rem)]">
        {lessonsForClass.map(l => (
          <button key={l.number} onClick={() => setEditing({ number: l.number })}
            className={[
              'w-full text-left rounded-2xl border p-3 flex items-stretch gap-3',
              l.isConflict
                ? 'bg-red-50 dark:bg-red-950/30 border-red-400/70 dark:border-red-800/70 ring-2 ring-red-300/40 dark:ring-red-900/40'
                : 'border-line-light dark:border-line-dark bg-panel-light dark:bg-panel-dark',
            ].join(' ')}>
            <div className="w-11 shrink-0 flex flex-col items-center justify-center text-center border-r border-line-light dark:border-line-dark pr-3">
              <div className="font-serif text-[22px] font-medium leading-none tabular-nums">{l.number}</div>
              <div className="text-[10.5px] text-ink-3-light dark:text-ink-3-dark tabular-nums font-medium mt-1">
                {l.timeStart}<br />{l.timeEnd}
              </div>
            </div>
            <div className="flex-1 min-w-0 py-0.5">
              {l.groups.length === 0 ? (
                <div className="text-ink-3-light dark:text-ink-3-dark text-[13px] italic">+ Добавить</div>
              ) : (
                l.groups.map((g, i) => (
                  <div key={i} className={i > 0 ? 'mt-1.5 pt-1.5 border-t border-dashed border-line-light dark:border-line-dark' : ''}>
                    <div className="text-[14.5px] font-semibold leading-tight truncate">
                      {dicts?.subjects.find(s => s.id === g.subjectId)?.name ?? ''}
                    </div>
                    <div className="text-[12px] text-ink-2-light dark:text-ink-2-dark leading-tight mt-0.5">
                      {dicts?.teachers.find(t => t.id === g.teacherId)?.shortName ?? ''}
                      {g.roomId != null && (
                        <span className="ml-1.5 font-semibold text-ink-light dark:text-ink-dark tabular-nums">
                          {dicts?.rooms.find(r => r.id === g.roomId)?.name ?? ''}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </button>
        ))}
      </div>

      {editing && dicts && (
        <TemplateEditor
          day={day}
          className={activeClass}
          number={editing.number}
          time={timeFor(editing.number)}
          groups={editingGroups}
          dicts={dicts}
          onClose={() => setEditing(null)}
          onSaved={async () => { await onRefresh(); }}
        />
      )}
    </div>
  );
}

function TemplateEditor({ day, className, number, time, groups, dicts, onClose, onSaved }: {
  day: string; className: string; number: number;
  time: { timeStart: string; timeEnd: string };
  groups: AdminGroup[]; dicts: AdminDictionaries;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [editGroups, setEditGroups] = useState<AdminGroup[]>(groups.length ? groups : [{ subjectId: 0, teacherId: null, roomId: null }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEditGroups(groups.length ? groups : [{ subjectId: 0, teacherId: null, roomId: null }]);
  }, [day, className, number, groups]);

  const subjOpts = dicts.subjects.map(s => ({ id: s.id, label: s.name }));
  const teachOpts = dicts.teachers.map(t => ({ id: t.id, label: t.shortName }));
  const roomOpts = dicts.rooms.map(r => ({ id: r.id, label: r.name }));

  const save = async () => {
    const clean = editGroups.filter(g => g.subjectId > 0);
    setBusy(true);
    try { await adminApi.saveTemplateLesson(day, { className, number, groups: clean }); await onSaved(); onClose(); }
    finally { setBusy(false); }
  };
  const clear = async () => {
    const ok = await confirmDialog({ title: 'Убрать урок из стандарта?', message: 'В стандартном расписании этот урок больше не появится.', confirmText: 'Убрать', danger: true });
    if (!ok) return;
    setBusy(true);
    try { await adminApi.saveTemplateLesson(day, { className, number, groups: [] }); await onSaved(); onClose(); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-end" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full bg-bg-light dark:bg-bg-dark rounded-t-3xl max-h-[92vh] overflow-y-auto">
        <div className="pt-3 flex justify-center">
          <div className="w-10 h-1 rounded-full bg-line-light dark:bg-line-dark" />
        </div>
        <div className="px-6 pt-4 pb-4 border-b border-line-light dark:border-line-dark">
          <div className="text-[11px] font-bold tracking-[.1em] uppercase text-ink-3-light dark:text-ink-3-dark mb-1.5">
            Класс {className} · {day}
          </div>
          <h2 className="font-serif text-[24px] -tracking-[.01em] font-normal leading-tight">{number}-й урок</h2>
          <div className="text-[12.5px] text-ink-3-light dark:text-ink-3-dark tabular-nums mt-1">{time.timeStart} — {time.timeEnd}</div>
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
            {busy ? 'Сохраняем…' : 'Сохранить в шаблон'}
          </button>
          {groups.length > 0 && (
            <button onClick={clear} className="w-full py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13.5px] font-semibold text-red-600 dark:text-red-400">
              Убрать урок
            </button>
          )}
        </div>
        <div className="px-6 py-4">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark font-semibold text-[13.5px]">
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
