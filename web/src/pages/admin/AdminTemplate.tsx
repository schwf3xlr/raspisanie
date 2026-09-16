import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, type AdminDictionaries, type AdminGroup, type AdminTemplateResponse } from '../../lib/admin-api';
import { confirmDialog } from '../../lib/dialog';
import { DAYS, type DayName } from '../../lib/types';
import ScheduleGrid, { type GridCellData, DictSelect } from './ScheduleGrid';
import { useGridSelection } from './useGridSelection';
import AdminTemplateMobile from './AdminTemplateMobile';
import BellsModal from '../../components/admin/BellsModal';
import SheetsPickerModal from '../../components/admin/SheetsPickerModal';

export default function AdminTemplate() {
  const [acknowledged, setAcknowledged] = useState(false);
  const [day, setDay] = useState<DayName>('Понедельник');
  const [data, setData] = useState<AdminTemplateResponse | null>(null);
  const [dicts, setDicts] = useState<AdminDictionaries | null>(null);
  const [bellsOpen, setBellsOpen] = useState(false);
  const [sheetsOpen, setSheetsOpen] = useState(false);

  const refresh = useCallback(async () => {
    const d = await adminApi.template(day);
    setData(d);
  }, [day]);

  useEffect(() => { if (acknowledged) refresh(); }, [acknowledged, refresh]);
  useEffect(() => { adminApi.dictionaries().then(setDicts).catch(() => {}); }, []);

  const byKey = useMemo(() => {
    const m = new Map<string, { groups: AdminGroup[] }>();
    if (data) for (const l of data.lessons) m.set(`${l.className}::${l.number}`, { groups: l.groups });
    return m;
  }, [data]);
  const maxNumber = useMemo(() => {
    if (!data) return 8;
    return Math.max(8, ...data.lessons.map(l => l.number), ...data.timeSlots.map(t => t.number));
  }, [data]);
  const numbers = useMemo(() => Array.from({ length: maxNumber }, (_, i) => i + 1), [maxNumber]);

  const timeFor = useCallback((n: number) => {
    const t = data?.timeSlots.find(x => x.number === n);
    return { timeStart: t?.timeStart ?? '', timeEnd: t?.timeEnd ?? '' };
  }, [data]);

  const effectiveGroups = useCallback((cls: string, n: number): AdminGroup[] => {
    return byKey.get(`${cls}::${n}`)?.groups ?? [];
  }, [byKey]);

  const conflicts = useMemo(() => {
    const map = new Map<string, 'teacher' | 'room' | 'both'>();
    if (!data) return map;
    const merge = (k: string, kind: 'teacher' | 'room') => {
      const cur = map.get(k);
      if (!cur) map.set(k, kind);
      else if (cur !== kind) map.set(k, 'both');
    };
    for (const n of numbers) {
      const byTeacher = new Map<number, string[]>();
      const byRoom = new Map<number, string[]>();
      for (const c of data.classes) {
        const groups = byKey.get(`${c}::${n}`)?.groups ?? [];
        const seenT = new Set<number>();
        const seenR = new Set<number>();
        for (const g of groups) {
          if (g.teacherId != null && !seenT.has(g.teacherId)) {
            seenT.add(g.teacherId);
            const arr = byTeacher.get(g.teacherId) ?? [];
            arr.push(c);
            byTeacher.set(g.teacherId, arr);
          }
          if (g.roomId != null && !seenR.has(g.roomId)) {
            seenR.add(g.roomId);
            const arr = byRoom.get(g.roomId) ?? [];
            arr.push(c);
            byRoom.set(g.roomId, arr);
          }
        }
      }
      for (const [, cls] of byTeacher) if (cls.length > 1) for (const c of cls) merge(`${c}::${n}`, 'teacher');
      for (const [, cls] of byRoom)    if (cls.length > 1) for (const c of cls) merge(`${c}::${n}`, 'room');
    }
    return map;
  }, [data, numbers, byKey]);

  const dataFor = useCallback((cls: string, n: number): GridCellData | null => {
    const l = byKey.get(`${cls}::${n}`);
    if (!l) return null;
    return { groups: l.groups, conflict: conflicts.get(`${cls}::${n}`) };
  }, [byKey, conflicts]);

  const savePasted = useCallback(async (cls: string, n: number, groups: AdminGroup[]) => {
    await adminApi.saveTemplateLesson(day, { className: cls, number: n, groups });
  }, [day]);

  const sel = useGridSelection({
    classes: data?.classes ?? [],
    numbers,
    groupsAt: effectiveGroups,
    onPaste: savePasted,
    onAfterPaste: refresh,
  });

  useEffect(() => { sel.clearSelection(); }, [day]); // eslint-disable-line react-hooks/exhaustive-deps

  const doPaste = useCallback(async () => {
    const { pasted } = await sel.paste();
    if (pasted > 0) await refresh();
  }, [sel, refresh]);

  if (!acknowledged) return <TemplateGate onOk={() => setAcknowledged(true)} />;
  if (!data) return <div className="p-10 text-ink-2-light dark:text-ink-2-dark">Загружаем…</div>;

  const selectedLesson = sel.isSingle && sel.anchor ? byKey.get(`${sel.anchor.className}::${sel.anchor.number}`) ?? null : null;

  return (
    <div className="min-h-screen md:flex md:flex-col">
      <AdminTemplateMobile
        day={day}
        data={data}
        dicts={dicts}
        onSetDay={setDay}
        onRefresh={refresh}
      />

      <div className="hidden md:flex md:flex-col md:flex-1 md:min-h-screen">
      <div className="bg-yellow-100 dark:bg-yellow-950/40 text-yellow-900 dark:text-yellow-200 border-b border-yellow-300/50 dark:border-yellow-900/50 px-4 md:px-8 py-2.5 text-[12.5px] md:text-[13px] font-semibold flex items-start md:items-center gap-2">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="shrink-0 mt-0.5 md:mt-0"><path d="M12 9v4M12 17h.01M4.9 20.5h14.2a2 2 0 001.75-2.98l-7.1-12.5a2 2 0 00-3.5 0L3.16 17.52A2 2 0 004.9 20.5z"/></svg>
        <span>Стандартное расписание - изменения применятся ко всем будущим неделям без замены.</span>
      </div>

      <header className="px-4 md:px-8 pt-5 md:pt-6 pb-4 border-b border-line-light dark:border-line-dark bg-[#faf6ee] dark:bg-[#141210]">
        <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="font-serif text-[28px] md:text-[36px] -tracking-[.02em] leading-none font-normal">Стандартное расписание</h1>
            <p className="text-ink-2-light dark:text-ink-2-dark text-[13px] md:text-[13.5px] mt-1.5">
              Меняйте, когда меняется постоянное расписание.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setSheetsOpen(true)}
              className="text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark px-3 py-2 rounded-full border border-line-light dark:border-line-dark"
              title="Импорт/экспорт этого дня в Google Таблицу"
            >
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/></svg>
                Google Таблицы
              </span>
            </button>
            <button
              onClick={() => setBellsOpen(true)}
              className="text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark px-3 py-2 rounded-full border border-line-light dark:border-line-dark"
            >
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/></svg>
                Звонки
              </span>
            </button>
          </div>
        </div>
        <div className="flex gap-1 bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-full p-1 w-fit max-w-full overflow-x-auto no-scrollbar">
          {DAYS.map(d => (
            <button key={d} onClick={() => { setDay(d); }}
              className={[
                'shrink-0 px-3 md:px-4 py-1.5 rounded-full text-[13px] font-semibold transition-colors',
                day === d ? 'bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark' : 'text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark',
              ].join(' ')}
            >{d}</button>
          ))}
        </div>
        {sel.isMulti && (
          <div className="mt-3 bg-accent-soft dark:bg-accent-soft-dark border border-accent/30 dark:border-accent-dark/30 rounded-xl px-4 py-2.5 flex items-center gap-3">
            <span className="text-[13px] font-semibold text-accent dark:text-accent-dark">Выделено {sel.selection.size}</span>
            <button onClick={sel.copySelection} className="text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark">Копировать (Ctrl+C)</button>
            {sel.clipboard && <button onClick={doPaste} className="text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark">Вставить (Ctrl+V)</button>}
            <button onClick={sel.clearSelection} className="ml-auto text-[13px] font-medium text-ink-2-light dark:text-ink-2-dark">Отмена</button>
            <div className="text-[11px] text-ink-3-light dark:text-ink-3-dark hidden md:block">Shift-клик - прямоугольник · Ctrl+A - всё</div>
          </div>
        )}
      </header>

      <div className="flex-1 flex min-h-0">
        <ScheduleGrid
          classes={data.classes}
          numbers={numbers}
          timeFor={timeFor}
          dataFor={dataFor}
          selection={sel.selection}
          anchor={sel.anchor}
          onCellClick={sel.onCellClick}
          dicts={dicts}
          tint="template"
        />

        {sel.isSingle && sel.anchor && (
          <TemplateDrawer
            day={day}
            className={sel.anchor.className}
            number={sel.anchor.number}
            time={timeFor(sel.anchor.number)}
            groups={selectedLesson?.groups ?? []}
            dicts={dicts}
            hasClipboard={!!sel.clipboard}
            onPaste={doPaste}
            onClose={() => sel.clearSelection()}
            onSaved={refresh}
          />
        )}
      </div>
      </div>{/* /desktop wrapper */}

      {bellsOpen && (
        <BellsModal
          day={day}
          initial={data.timeSlots}
          onClose={() => { setBellsOpen(false); refresh(); }}
        />
      )}
      {sheetsOpen && (
        <SheetsPickerModal
          kind="template"
          day={day}
          targetLabel={day}
          onClose={() => setSheetsOpen(false)}
          onDone={() => refresh()}
        />
      )}
    </div>
  );
}

function TemplateGate({ onOk }: { onOk: () => void }) {
  return (
    <div className="min-h-screen grid place-items-center px-6 bg-[#faf6ee] dark:bg-[#141210]">
      <div className="max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-yellow-100 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 grid place-items-center mx-auto mb-5">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M12 9v4M12 17h.01M4.9 20.5h14.2a2 2 0 001.75-2.98l-7.1-12.5a2 2 0 00-3.5 0L3.16 17.52A2 2 0 004.9 20.5z"/></svg>
        </div>
        <h1 className="font-serif text-[30px] -tracking-[.02em] mb-3 font-normal">Редактирование стандартного расписания</h1>
        <p className="text-ink-2-light dark:text-ink-2-dark text-[14.5px] leading-relaxed mb-2">
          Эти изменения применятся <b className="text-ink-light dark:text-ink-dark">ко всем будущим неделям</b>, где не задана замена.
        </p>
        <p className="text-ink-3-light dark:text-ink-3-dark text-[13.5px] leading-relaxed mb-8">
          Обычные замены (болезнь учителя, перенос урока) редактируйте в разделе «Расписание».
        </p>
        <button onClick={onOk} className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[14px]">Понял, редактировать →</button>
      </div>
    </div>
  );
}

function TemplateDrawer({ day, className, number, time, groups, dicts, hasClipboard, onPaste, onClose, onSaved }: {
  day: string; className: string; number: number;
  time: { timeStart: string; timeEnd: string };
  groups: AdminGroup[]; dicts: AdminDictionaries | null;
  hasClipboard: boolean; onPaste: () => void;
  onClose: () => void; onSaved: () => void;
}) {
  const [editGroups, setEditGroups] = useState<AdminGroup[]>(groups.length ? groups : [{ subjectId: 0, teacherId: null, roomId: null }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setEditGroups(groups.length ? groups : [{ subjectId: 0, teacherId: null, roomId: null }]);
  }, [day, className, number, groups]);

  if (!dicts) return null;
  const subjOpts = dicts.subjects.map(s => ({ id: s.id, label: s.name }));
  const teachOpts = dicts.teachers.map(t => ({ id: t.id, label: t.shortName }));
  const roomOpts = dicts.rooms.map(r => ({ id: r.id, label: r.name }));

  const save = async () => {
    const clean = editGroups.filter(g => g.subjectId > 0);
    setBusy(true);
    try { await adminApi.saveTemplateLesson(day, { className, number, groups: clean }); onSaved(); onClose(); }
    finally { setBusy(false); }
  };
  const clear = async () => {
    const ok = await confirmDialog({
      title: 'Убрать урок из стандарта?',
      message: 'В стандартном расписании этот урок больше не появится.',
      confirmText: 'Убрать', danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try { await adminApi.saveTemplateLesson(day, { className, number, groups: [] }); onSaved(); onClose(); }
    finally { setBusy(false); }
  };

  return (
    <aside className="w-[380px] shrink-0 border-l border-line-light dark:border-line-dark bg-[#faf6ee] dark:bg-[#141210] overflow-y-auto">
      <div className="p-6 border-b border-line-light dark:border-line-dark">
        <div className="text-[11px] font-bold tracking-[.1em] uppercase text-ink-3-light dark:text-ink-3-dark mb-1.5">Класс {className} · {day}</div>
        <h2 className="font-serif text-[26px] -tracking-[.01em] font-normal leading-tight">{number}-й урок</h2>
        <div className="text-[12.5px] text-ink-3-light dark:text-ink-3-dark tabular-nums mt-1">{time.timeStart} - {time.timeEnd}</div>
        {hasClipboard && (
          <button onClick={onPaste} className="mt-3 w-full py-2 rounded-lg bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[12.5px] font-semibold text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark">
            Вставить из буфера (Ctrl+V)
          </button>
        )}
      </div>
      <div className="p-6 space-y-4">
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
            <div className="grid grid-cols-2 gap-2">
              <DictSelect value={g.teacherId} options={teachOpts} placeholder="Учитель" allowEmpty
                onChange={id => setEditGroups(gs => gs.map((x, idx) => idx === i ? { ...x, teacherId: id } : x))} />
              <DictSelect value={g.roomId} options={roomOpts} placeholder="Кабинет" allowEmpty
                onChange={id => setEditGroups(gs => gs.map((x, idx) => idx === i ? { ...x, roomId: id } : x))} />
            </div>
          </div>
        ))}
        {editGroups.length < 3 && (
          <button onClick={() => setEditGroups(gs => [...gs, { subjectId: 0, teacherId: null, roomId: null }])}
            className="w-full py-2 rounded-lg border border-dashed border-line-light dark:border-line-dark text-[12.5px] font-semibold text-ink-2-light dark:text-ink-2-dark hover:border-accent hover:text-accent">
            + группа
          </button>
        )}
      </div>
      <div className="px-6 pb-6 space-y-2">
        <button onClick={save} disabled={busy} className="w-full py-3 rounded-xl bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[14px] disabled:opacity-50">
          {busy ? 'Сохраняем…' : 'Сохранить в шаблон'}
        </button>
        {groups.length > 0 && (
          <button onClick={clear} className="w-full py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13px] font-semibold text-red-600 dark:text-red-400">Убрать урок</button>
        )}
        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13px] font-semibold">Закрыть</button>
      </div>
    </aside>
  );
}
