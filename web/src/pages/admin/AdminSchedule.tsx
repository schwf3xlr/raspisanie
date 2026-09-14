import { useCallback, useEffect, useMemo, useState } from 'react';
import { adminApi, type AdminDayResponse, type AdminDictionaries, type AdminGroup, type AdminOverride, type AdminTemplateLesson, type PublishResponse } from '../../lib/admin-api';
import { confirmDialog } from '../../lib/dialog';
import {
  addDays, fmtDate, fmtWeekLabel, fromISODate, isSameDate, mondayOf, toISODate,
} from '../../lib/time';
import { DAY_SHORT } from '../../lib/types';
import ScheduleGrid, { type GridCellData, DictSelect } from './ScheduleGrid';
import { useGridSelection } from './useGridSelection';
import AdminScheduleMobile from './AdminScheduleMobile';
import PublishSheet from '../../components/admin/PublishSheet';
import DayBellsModal from '../../components/admin/DayBellsModal';

export default function AdminSchedule() {
  const [monday, setMonday] = useState<Date>(() => mondayOf(new Date()));
  const [dateIso, setDateIso] = useState<string>(() => {
    const t = new Date();
    const dow = t.getDay();
    if (dow >= 1 && dow <= 5) return toISODate(t);
    return toISODate(mondayOf(t));
  });
  const [data, setData] = useState<AdminDayResponse | null>(null);
  const [dicts, setDicts] = useState<AdminDictionaries | null>(null);
  const [classPopover, setClassPopover] = useState<string | null>(null);
  const [numberPopover, setNumberPopover] = useState<number | null>(null);
  const [wholeSchoolOpen, setWholeSchoolOpen] = useState(false);
  const [dayBellsOpen, setDayBellsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await adminApi.day(dateIso);
      setData(d);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [dateIso]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { adminApi.dictionaries().then(setDicts).catch(() => {}); }, []);

  const workdays = useMemo(() => Array.from({ length: 5 }, (_, i) => addDays(monday, i)), [monday]);

  const templateByKey = useMemo(() => {
    const m = new Map<string, AdminTemplateLesson>();
    if (data) for (const t of data.template) m.set(`${t.className}::${t.number}`, t);
    return m;
  }, [data]);
  const overrideByKey = useMemo(() => {
    const m = new Map<string, AdminOverride>();
    if (data) for (const o of data.overrides) m.set(`${o.className}::${o.number}`, o);
    return m;
  }, [data]);
  const distantAllDay = useMemo(() => {
    return new Set((data?.distant ?? []).filter(d => d.lessonNumber == null).map(d => d.className));
  }, [data]);
  const distantByLesson = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const d of data?.distant ?? []) {
      if (d.lessonNumber != null) m.set(`${d.className}::${d.lessonNumber}`, d.note);
    }
    return m;
  }, [data]);

  const maxNumber = useMemo(() => {
    if (!data) return 8;
    return Math.max(8,
      ...data.template.map(l => l.number),
      ...data.overrides.map(o => o.number),
      ...data.timeSlots.map(t => t.number),
    );
  }, [data]);
  const numbers = useMemo(() => Array.from({ length: maxNumber }, (_, i) => i + 1), [maxNumber]);

  // Стандартное время урока (из шаблона звонков этого дня недели).
  const standardTimeFor = useCallback((n: number): { timeStart: string; timeEnd: string } => {
    const t = data?.timeSlots.find(x => x.number === n);
    return { timeStart: t?.timeStart ?? '', timeEnd: t?.timeEnd ?? '' };
  }, [data]);

  // Фактическое время урока в этот день: если у любого класса есть override с нестандартным
  // временем (звонки на этот день изменены через DayBellsModal - оно ставится всем классам
  // одинаково), берём его. Иначе - стандартное.
  const timeFor = useCallback((n: number): { timeStart: string; timeEnd: string } => {
    const std = standardTimeFor(n);
    if (!data) return std;
    for (const o of data.overrides) {
      if (o.number !== n) continue;
      if (!o.timeStart || !o.timeEnd) continue;
      if (o.timeStart !== std.timeStart || o.timeEnd !== std.timeEnd) {
        return { timeStart: o.timeStart, timeEnd: o.timeEnd };
      }
    }
    return std;
  }, [data, standardTimeFor]);

  const effectiveGroups = useCallback((cls: string, n: number): AdminGroup[] => {
    const override = overrideByKey.get(`${cls}::${n}`);
    if (override) return override.isCancelled ? [] : override.groups;
    const tpl = templateByKey.get(`${cls}::${n}`);
    return tpl?.groups ?? [];
  }, [overrideByKey, templateByKey]);

  const conflicts = useMemo(() => computeConflicts(data?.classes ?? [], numbers, effectiveGroups), [data?.classes, numbers, effectiveGroups]);

  const dataFor = useCallback((cls: string, n: number): GridCellData | null => {
    const override = overrideByKey.get(`${cls}::${n}`);
    const tpl = templateByKey.get(`${cls}::${n}`);
    const source = override ?? tpl;
    if (!source) return null;
    const isDistant = distantAllDay.has(cls) || distantByLesson.has(`${cls}::${n}`);
    // «Замена» - только если реально изменились группы. Смена времени звонков - не замена.
    const isRealReplacement = !!override && !sameGroupsAdmin(override.groups, tpl?.groups ?? []);
    // Изменено ли время урока на эту дату (относительно стандарта звонков).
    const std = standardTimeFor(n);
    const timeOverridden = !!override
      && !!override.timeStart && !!override.timeEnd
      && (override.timeStart !== std.timeStart || override.timeEnd !== std.timeEnd);
    return {
      groups: source.groups,
      fromOverride: isRealReplacement,
      timeOverridden,
      isCancelled: !!override?.isCancelled,
      isDistant,
      conflict: conflicts.get(`${cls}::${n}`),
    };
  }, [templateByKey, overrideByKey, distantAllDay, distantByLesson, conflicts, standardTimeFor]);

  const savePasted = useCallback(async (cls: string, n: number, groups: AdminGroup[]) => {
    await adminApi.saveOverride({ date: dateIso, className: cls, number: n, groups });
  }, [dateIso]);

  const sel = useGridSelection({
    classes: data?.classes ?? [],
    numbers,
    groupsAt: effectiveGroups,
    onPaste: savePasted,
    onAfterPaste: refresh,
  });

  useEffect(() => { sel.clearSelection(); }, [dateIso]); // eslint-disable-line react-hooks/exhaustive-deps

  const doPaste = useCallback(async () => {
    const { pasted } = await sel.paste();
    if (pasted > 0) await refresh();
  }, [sel, refresh]);

  const setDay = (d: Date) => {
    setDateIso(toISODate(d));
    setClassPopover(null);
    setNumberPopover(null);
  };
  const goPrev = () => setMonday(m => addDays(m, -7));
  const goNext = () => setMonday(m => addDays(m, 7));
  const goToday = () => {
    const t = new Date();
    setMonday(mondayOf(t));
    setDay(t.getDay() >= 1 && t.getDay() <= 5 ? t : mondayOf(t));
  };

  const isWholeSchoolDistant = useMemo(() => {
    if (!data || data.classes.length === 0) return false;
    return data.classes.every(c => distantAllDay.has(c));
  }, [data, distantAllDay]);

  const wholeSchoolNote = useMemo(() => {
    if (!data || !isWholeSchoolDistant) return '';
    const first = data.distant.find(d => d.lessonNumber == null);
    return first?.note ?? '';
  }, [data, isWholeSchoolDistant]);

  const [publishTarget, setPublishTarget] = useState<'day' | 'week' | null>(null);
  const [publishToast, setPublishToast] = useState<string | null>(null);

  const publishDay = () => setPublishTarget('day');
  const publishWeek = () => setPublishTarget('week');
  const unpublishDay = async () => {
    const ok = await confirmDialog({
      title: 'Отозвать публикацию?',
      message: 'Ученики перестанут видеть этот день, пока вы не опубликуете его снова.',
      confirmText: 'Отозвать', danger: true,
    });
    if (!ok) return;
    await adminApi.unpublishDay(dateIso); refresh();
  };

  const onPublishDone = (res: PublishResponse) => {
    refresh();
    if (res.push) {
      setPublishToast(`Опубликовано. Push-уведомление: ${res.push.succeeded} из ${res.push.attempted}${res.push.cleaned ? `, битых токенов удалено: ${res.push.cleaned}` : ''}`);
    } else {
      setPublishToast('Опубликовано.');
    }
    setTimeout(() => setPublishToast(null), 4500);
  };

  const setDistantAllSchool = async (note: string) => {
    await adminApi.setDistantAllClasses({ date: dateIso, lessonNumber: null, note: note || null });
    refresh();
  };
  const clearDistantAllSchool = async () => {
    if (!data) return;
    for (const c of data.classes) await adminApi.clearDistant({ date: dateIso, className: c, lessonNumber: null });
    refresh();
  };

  const selectedLesson = sel.isSingle && sel.anchor
    ? (overrideByKey.get(`${sel.anchor.className}::${sel.anchor.number}`) ?? templateByKey.get(`${sel.anchor.className}::${sel.anchor.number}`) ?? null)
    : null;
  const selectedIsOverride = sel.isSingle && sel.anchor ? overrideByKey.has(`${sel.anchor.className}::${sel.anchor.number}`) : false;
  const selectedIsDistantLesson = sel.isSingle && sel.anchor ? distantByLesson.has(`${sel.anchor.className}::${sel.anchor.number}`) : false;

  if (error && !data) return <div className="p-10 text-red-500">{error}</div>;
  if (!data) return null;

  const today = new Date();

  return (
    <div className="min-h-screen md:flex md:flex-col">
      <AdminScheduleMobile
        monday={monday}
        dateIso={dateIso}
        data={data}
        dicts={dicts}
        templateByKey={templateByKey}
        overrideByKey={overrideByKey}
        distantAllDay={distantAllDay}
        distantByLesson={distantByLesson}
        isWholeSchoolDistant={isWholeSchoolDistant}
        numbers={numbers}
        timeFor={timeFor}
        onSetMonday={setMonday}
        onSetDate={iso => { setDateIso(iso); setClassPopover(null); setNumberPopover(null); }}
        onRefresh={refresh}
        onOpenWholeSchool={() => setWholeSchoolOpen(true)}
        onOpenDayBells={() => setDayBellsOpen(true)}
        onPublish={publishDay}
        onUnpublish={unpublishDay}
        onPublishWeek={publishWeek}
      />

      <div className="hidden md:flex md:flex-col md:flex-1 md:min-h-screen">
      <header className="px-8 pt-8 pb-5 border-b border-line-light dark:border-line-dark">
        <div className="flex items-baseline justify-between gap-4 mb-5 flex-wrap">
          <div>
            <h1 className="font-serif text-[36px] -tracking-[.02em] leading-none font-normal">Расписание</h1>
            <p className="text-ink-2-light dark:text-ink-2-dark text-[13.5px] mt-1.5">
              {data.day}, {fmtDate(fromISODate(dateIso))} - правки только на эту дату.
            </p>
          </div>
          <div className="flex gap-2 items-center flex-wrap">
            <PublishBadge published={data.published} publishedAt={data.publishedAt} />
            {data.published ? (
              <button onClick={unpublishDay} className="text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark px-3 py-2 rounded-full border border-line-light dark:border-line-dark">Отозвать</button>
            ) : (
              <button onClick={publishDay} className="text-[13px] font-semibold text-white bg-accent dark:bg-accent-dark hover:opacity-90 px-4 py-2 rounded-full">Опубликовать день</button>
            )}
            <button onClick={publishWeek} className="text-[13px] font-semibold text-ink-light dark:text-ink-dark bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark hover:bg-line-2-light dark:hover:bg-line-2-dark px-3 py-2 rounded-full">Опубликовать неделю</button>
            <button
              onClick={() => setWholeSchoolOpen(true)}
              className={[
                'text-[13px] font-semibold px-3 py-2 rounded-full border transition-colors inline-flex items-center gap-1.5',
                isWholeSchoolDistant
                  ? 'bg-distant-soft dark:bg-distant-soft-dark text-distant dark:text-distant-dark border-distant/25 dark:border-distant-dark/30 hover:bg-distant/10 dark:hover:bg-distant-dark/20'
                  : 'text-ink-2-light dark:text-ink-2-dark border-line-light dark:border-line-dark hover:text-ink-light dark:hover:text-ink-dark',
              ].join(' ')}
              title={isWholeSchoolDistant ? 'Вся школа сегодня на дистанте' : 'Пометить всю школу на дистанте'}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>
              {isWholeSchoolDistant ? 'Вся школа на дистанте' : 'Дистант всей школы'}
              {isWholeSchoolDistant && (
                <span className="w-1.5 h-1.5 bg-distant dark:bg-distant-dark rounded-full animate-pulse ml-0.5" />
              )}
            </button>
            <button
              onClick={() => setDayBellsOpen(true)}
              className="text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark px-3 py-2 rounded-full border border-line-light dark:border-line-dark inline-flex items-center gap-1.5"
              title="Изменить время звонков только на этот день"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/></svg>
              Звонки на день
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-3 flex-wrap">
          <button onClick={goPrev} className="w-9 h-9 rounded-xl border border-line-light dark:border-line-dark grid place-items-center text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark hover:bg-panel-light dark:hover:bg-panel-dark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button onClick={goToday} className="text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark tabular-nums px-2">{fmtWeekLabel(monday)}</button>
          <button onClick={goNext} className="w-9 h-9 rounded-xl border border-line-light dark:border-line-dark grid place-items-center text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark hover:bg-panel-light dark:hover:bg-panel-dark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6"/></svg>
          </button>
          <div className="flex gap-1 ml-2">
            {workdays.map((d, i) => {
              const iso = toISODate(d);
              const dayName = Object.values(DAY_SHORT)[i]!;
              const on = iso === dateIso;
              const isToday = isSameDate(d, today);
              return (
                <button key={iso} onClick={() => setDay(d)}
                  className={[
                    'px-3.5 py-2 rounded-xl border transition-colors text-center min-w-[56px]',
                    on ? 'bg-ink-light text-bg-light border-ink-light dark:bg-ink-dark dark:text-bg-dark dark:border-ink-dark'
                      : 'text-ink-2-light dark:text-ink-2-dark border-line-light dark:border-line-dark hover:bg-panel-light dark:hover:bg-panel-dark',
                  ].join(' ')}>
                  <div className={['text-[10px] font-bold tracking-wider uppercase', on ? 'opacity-70' : 'opacity-60'].join(' ')}>{dayName}</div>
                  <div className="font-serif text-[16px] font-medium leading-none tabular-nums mt-0.5">{d.getDate()}</div>
                  {isToday && <div className={['mx-auto mt-0.5 w-1 h-1 rounded-full', on ? 'bg-white' : 'bg-accent dark:bg-accent-dark'].join(' ')} />}
                </button>
              );
            })}
          </div>
        </div>

        {sel.isMulti && (
          <MultiSelectBar
            count={sel.selection.size}
            hasClipboard={!!sel.clipboard}
            onCopy={sel.copySelection}
            onPaste={doPaste}
            onClear={sel.clearSelection}
          />
        )}
      </header>

      <div className="flex-1 flex min-h-0 relative">
        <ScheduleGrid
          classes={data.classes}
          numbers={numbers}
          timeFor={timeFor}
          dataFor={dataFor}
          selection={sel.selection}
          anchor={sel.anchor}
          onCellClick={(cls, n, mods) => { sel.onCellClick(cls, n, mods); setClassPopover(null); setNumberPopover(null); }}
          onClickClass={cls => { setClassPopover(cls); setNumberPopover(null); sel.clearSelection(); }}
          onClickNumber={n => { setNumberPopover(n); setClassPopover(null); sel.clearSelection(); }}
          dicts={dicts}
          tint="week"
        />

        {sel.isSingle && sel.anchor && (
          <CellDrawer
            date={dateIso}
            className={sel.anchor.className}
            number={sel.anchor.number}
            time={timeFor(sel.anchor.number)}
            isOverride={selectedIsOverride}
            isDistantLesson={selectedIsDistantLesson}
            isWholeDayDistant={distantAllDay.has(sel.anchor.className)}
            groups={selectedLesson?.groups ?? []}
            dicts={dicts}
            hasClipboard={!!sel.clipboard}
            onPaste={doPaste}
            onClose={() => sel.clearSelection()}
            onSaved={refresh}
          />
        )}

        {classPopover && (
          <ClassActions
            className={classPopover}
            date={dateIso}
            wholeDay={distantAllDay.has(classPopover)}
            onClose={() => setClassPopover(null)}
            onSaved={refresh}
          />
        )}

        {numberPopover != null && (
          <NumberActions
            number={numberPopover}
            date={dateIso}
            classes={data.classes}
            distantSet={distantByLesson}
            onClose={() => setNumberPopover(null)}
            onSaved={refresh}
          />
        )}
      </div>
      </div>{/* /desktop wrapper */}

      {wholeSchoolOpen && (
        <WholeSchoolModal
          date={dateIso}
          classCount={data.classes.length}
          active={isWholeSchoolDistant}
          initialNote={wholeSchoolNote}
          onActivate={async note => { await setDistantAllSchool(note); setWholeSchoolOpen(false); }}
          onDeactivate={async () => { await clearDistantAllSchool(); setWholeSchoolOpen(false); }}
          onClose={() => setWholeSchoolOpen(false)}
        />
      )}

      {dayBellsOpen && (
        <DayBellsModal
          date={dateIso}
          dateLabel={`${data.day}, ${fmtDate(fromISODate(dateIso))}`}
          timeSlots={data.timeSlots}
          template={data.template}
          overrides={data.overrides}
          onClose={() => setDayBellsOpen(false)}
          onSaved={() => { void refresh(); }}
        />
      )}

      {publishTarget === 'day' && (
        <PublishSheet
          open
          onClose={() => setPublishTarget(null)}
          target={{ kind: 'day', date: dateIso, dateLabel: `${data.day}, ${fmtDate(fromISODate(dateIso))}` }}
          classes={data.classes}
          onDone={onPublishDone}
        />
      )}
      {publishTarget === 'week' && (
        <PublishSheet
          open
          onClose={() => setPublishTarget(null)}
          target={{ kind: 'week', weekStart: toISODate(monday), weekLabel: fmtWeekLabel(monday) }}
          classes={data.classes}
          onDone={onPublishDone}
        />
      )}

      {publishToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[110] bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark px-4 py-2.5 rounded-full text-[13.5px] font-semibold shadow-2xl">
          {publishToast}
        </div>
      )}
    </div>
  );
}

function WholeSchoolModal({ date, classCount, active, initialNote, onActivate, onDeactivate, onClose }: {
  date: string; classCount: number; active: boolean; initialNote: string;
  onActivate: (note: string) => Promise<void>;
  onDeactivate: () => Promise<void>;
  onClose: () => void;
}) {
  const [note, setNote] = useState(initialNote);
  const [busy, setBusy] = useState(false);

  const activate = async () => { setBusy(true); try { await onActivate(note); } finally { setBusy(false); } };
  const deactivate = async () => {
    const ok = await confirmDialog({
      title: 'Снять дистант со всей школы?',
      message: 'Все классы вернутся к обычному расписанию на этот день.',
      confirmText: 'Снять', danger: true,
    });
    if (!ok) return;
    setBusy(true); try { await onDeactivate(); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-30 grid place-items-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-bg-light dark:bg-bg-dark w-full max-w-md rounded-3xl p-7">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-11 h-11 rounded-2xl bg-distant-soft dark:bg-distant-soft-dark text-distant dark:text-distant-dark grid place-items-center shrink-0">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>
          </div>
          <div className="min-w-0">
            <h2 className="font-serif text-[24px] -tracking-[.01em] font-normal leading-tight">Дистант всей школы</h2>
            <p className="text-ink-2-light dark:text-ink-2-dark text-[13px] mt-1">
              {new Date(date).toLocaleDateString('ru', { day: 'numeric', month: 'long', weekday: 'long' })}
            </p>
          </div>
        </div>

        {active ? (
          <>
            <div className="bg-distant-soft dark:bg-distant-soft-dark border border-distant/20 dark:border-distant-dark/25 rounded-2xl p-4 mb-5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-distant dark:text-distant-dark">
                <span className="w-1.5 h-1.5 bg-distant dark:bg-distant-dark rounded-full animate-pulse" />
                Сейчас активен для всех классов
              </div>
              {initialNote && (
                <div className="text-[13px] text-ink-2-light dark:text-ink-2-dark mt-2">Заметка: <b className="text-ink-light dark:text-ink-dark font-semibold">{initialNote}</b></div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark font-semibold text-[14px]">Закрыть</button>
              <button onClick={deactivate} disabled={busy} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-semibold text-[14px] disabled:opacity-50">
                {busy ? 'Снимаем…' : 'Снять со всех'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-ink-2-light dark:text-ink-2-dark text-[14px] leading-relaxed mb-4">
              Пометит весь день дистанционным для всех {classCount} {plural(classCount, 'класса', 'классов', 'классов')}. Ученики увидят синюю плашку в своём расписании.
            </p>
            <label className="block text-[12px] font-bold tracking-[.05em] uppercase text-ink-3-light dark:text-ink-3-dark mb-1.5">
              Причина (необязательно)
            </label>
            <input
              type="text" value={note} onChange={e => setNote(e.target.value)}
              placeholder="Например, актировка или карантин"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') activate(); }}
              className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-xl px-3.5 py-3 text-[14.5px] focus:outline-none focus:border-distant dark:focus:border-distant-dark mb-5"
            />
            <div className="flex gap-2">
              <button onClick={onClose} className="flex-1 py-3 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark font-semibold text-[14px]">Отмена</button>
              <button onClick={activate} disabled={busy} className="flex-1 py-3 rounded-xl bg-distant dark:bg-distant-dark text-white font-semibold text-[14px] disabled:opacity-50">
                {busy ? 'Помечаем…' : 'Пометить всех'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function plural(n: number, one: string, few: string, many: string): string {
  const abs = Math.abs(n) % 100;
  const tens = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (tens > 1 && tens < 5) return few;
  if (tens === 1) return one;
  return many;
}

// Строгое сравнение двух наборов групп по составу (subjectId + teacherId + roomId).
function sameGroupsAdmin(a: AdminGroup[], b: AdminGroup[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const g1 = a[i]!;
    const g2 = b[i]!;
    if (g1.subjectId !== g2.subjectId) return false;
    if ((g1.teacherId ?? null) !== (g2.teacherId ?? null)) return false;
    if ((g1.roomId ?? null) !== (g2.roomId ?? null)) return false;
  }
  return true;
}

type ConflictMap = Map<string, 'teacher' | 'room' | 'both'>;

function mergeConflict(map: ConflictMap, key: string, kind: 'teacher' | 'room') {
  const cur = map.get(key);
  if (!cur) map.set(key, kind);
  else if (cur !== kind) map.set(key, 'both');
}

function computeConflicts(classes: string[], numbers: number[], groupsAt: (cls: string, n: number) => AdminGroup[]): ConflictMap {
  const map: ConflictMap = new Map();
  for (const n of numbers) {
    // teacher-конфликт: один учитель ведёт >1 класса в этот номер урока
    const byTeacher = new Map<number, string[]>();
    // room-конфликт: один кабинет занят >1 классом в этот номер урока
    const byRoom = new Map<number, string[]>();

    for (const c of classes) {
      const groups = groupsAt(c, n);
      const teachersThisCell = new Set<number>();
      const roomsThisCell = new Set<number>();
      for (const g of groups) {
        if (g.teacherId != null && !teachersThisCell.has(g.teacherId)) {
          teachersThisCell.add(g.teacherId);
          const arr = byTeacher.get(g.teacherId) ?? [];
          arr.push(c);
          byTeacher.set(g.teacherId, arr);
        }
        if (g.roomId != null && !roomsThisCell.has(g.roomId)) {
          roomsThisCell.add(g.roomId);
          const arr = byRoom.get(g.roomId) ?? [];
          arr.push(c);
          byRoom.set(g.roomId, arr);
        }
      }
    }
    for (const [, cls] of byTeacher) if (cls.length > 1) for (const c of cls) mergeConflict(map, `${c}::${n}`, 'teacher');
    for (const [, cls] of byRoom)    if (cls.length > 1) for (const c of cls) mergeConflict(map, `${c}::${n}`, 'room');
  }
  return map;
}

function MultiSelectBar({ count, hasClipboard, onCopy, onPaste, onClear }: {
  count: number; hasClipboard: boolean; onCopy: () => void; onPaste: () => void; onClear: () => void;
}) {
  return (
    <div className="mt-3 bg-accent-soft dark:bg-accent-soft-dark border border-accent/30 dark:border-accent-dark/30 rounded-xl px-4 py-2.5 flex items-center gap-3">
      <span className="text-[13px] font-semibold text-accent dark:text-accent-dark">Выделено {count}</span>
      <button onClick={onCopy} className="text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark">
        Копировать (Ctrl+C)
      </button>
      {hasClipboard && (
        <button onClick={onPaste} className="text-[13px] font-semibold px-3 py-1.5 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark">
          Вставить (Ctrl+V)
        </button>
      )}
      <button onClick={onClear} className="ml-auto text-[13px] font-medium text-ink-2-light dark:text-ink-2-dark">Отмена</button>
      <div className="text-[11px] text-ink-3-light dark:text-ink-3-dark hidden md:block">Shift-клик - прямоугольник · Ctrl+A - всё</div>
    </div>
  );
}

function PublishBadge({ published, publishedAt }: { published: boolean; publishedAt: string | null }) {
  return (
    <span className={[
      'inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase px-2 py-1 rounded-full',
      published ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400' : 'bg-line-light dark:bg-line-dark text-ink-2-light dark:text-ink-2-dark',
    ].join(' ')}>
      <span className={`w-1.5 h-1.5 rounded-full ${published ? 'bg-green-500' : 'bg-ink-3-light dark:bg-ink-3-dark'}`} />
      {published ? 'Опубликовано' : 'Не опубликовано'}
      {published && publishedAt && (
        <span className="text-[10px] font-medium opacity-70 ml-1 normal-case tracking-normal">
          {new Date(publishedAt).toLocaleString('ru', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
        </span>
      )}
    </span>
  );
}

function CellDrawer({ date, className, number, time, isOverride, isDistantLesson, isWholeDayDistant, groups, dicts, hasClipboard, onPaste, onClose, onSaved }: {
  date: string; className: string; number: number;
  time: { timeStart: string; timeEnd: string };
  isOverride: boolean; isDistantLesson: boolean; isWholeDayDistant: boolean;
  groups: AdminGroup[]; dicts: AdminDictionaries | null;
  hasClipboard: boolean;
  onPaste: () => void;
  onClose: () => void; onSaved: () => void;
}) {
  const [editGroups, setEditGroups] = useState<AdminGroup[]>(groups.length ? groups : [{ subjectId: 0, teacherId: null, roomId: null }]);
  const [busy, setBusy] = useState(false);
  const [distantNote, setDistantNote] = useState('');

  useEffect(() => {
    setEditGroups(groups.length ? groups : [{ subjectId: 0, teacherId: null, roomId: null }]);
    setDistantNote('');
  }, [date, className, number, groups]);

  if (!dicts) return null;
  const subjOpts = dicts.subjects.map(s => ({ id: s.id, label: s.name }));
  const teachOpts = dicts.teachers.map(t => ({ id: t.id, label: t.shortName }));
  const roomOpts = dicts.rooms.map(r => ({ id: r.id, label: r.name }));

  const save = async () => {
    const clean = editGroups.filter(g => g.subjectId > 0);
    setBusy(true);
    try {
      await adminApi.saveOverride({ date, className, number, groups: clean });
      onSaved(); onClose();
    }
    finally { setBusy(false); }
  };
  const resetToTemplate = async () => {
    const ok = await confirmDialog({
      title: 'Вернуть к стандарту?',
      message: 'Замена на эту дату будет удалена - снова будет показан урок из стандартного расписания.',
      confirmText: 'Вернуть',
    });
    if (!ok) return;
    setBusy(true);
    try { await adminApi.clearOverride({ date, className, number }); onSaved(); onClose(); }
    finally { setBusy(false); }
  };
  const toggleDistant = async () => {
    setBusy(true);
    try {
      if (isDistantLesson) await adminApi.clearDistant({ date, className, lessonNumber: number });
      else await adminApi.setDistant({ date, className, lessonNumber: number, note: distantNote || null });
      onSaved();
    } finally { setBusy(false); }
  };

  return (
    <aside className="w-[380px] shrink-0 border-l border-line-light dark:border-line-dark bg-bg-light dark:bg-bg-dark overflow-y-auto">
      <div className="p-6 border-b border-line-light dark:border-line-dark">
        <div className="text-[11px] font-bold tracking-[.1em] uppercase text-ink-3-light dark:text-ink-3-dark mb-1.5">Класс {className} · {fmtDate(fromISODate(date))}</div>
        <h2 className="font-serif text-[26px] -tracking-[.01em] font-normal leading-tight">{number}-й урок</h2>
        <div className="text-[12.5px] text-ink-3-light dark:text-ink-3-dark tabular-nums mt-1">{time.timeStart} - {time.timeEnd}</div>
        {isOverride && <div className="mt-2 inline-flex items-center gap-1.5 bg-accent-soft dark:bg-accent-soft-dark text-accent dark:text-accent-dark text-[10.5px] font-bold tracking-[.06em] uppercase px-2 py-1 rounded-full">Замена</div>}
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
                <button type="button" onClick={() => setEditGroups(gs => gs.filter((_, idx) => idx !== i))} className="text-[11.5px] text-ink-3-light dark:text-ink-3-dark hover:text-red-500 font-medium">убрать</button>
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

      <div className="px-6 pb-5 space-y-2">
        <button onClick={save} disabled={busy} className="w-full py-3 rounded-xl bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[14px] disabled:opacity-50">
          {busy ? 'Сохраняем…' : isOverride ? 'Обновить замену' : 'Сохранить замену'}
        </button>
        {isOverride && (
          <button onClick={resetToTemplate} className="w-full py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark">Вернуть к стандарту</button>
        )}
      </div>

      <div className="px-6 py-5 border-t border-line-light dark:border-line-dark">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold text-distant dark:text-distant-dark">Урок дистанционно</div>
            <div className="text-[11.5px] text-ink-3-light dark:text-ink-3-dark mt-0.5">
              {isWholeDayDistant ? 'Весь день у класса дистант' : 'Отдельно этот урок'}
            </div>
          </div>
          <button disabled={isWholeDayDistant || busy} onClick={toggleDistant}
            className={['relative w-11 h-6 rounded-full transition-colors disabled:opacity-40',
              isDistantLesson ? 'bg-distant dark:bg-distant-dark' : 'bg-line-light dark:bg-line-dark'].join(' ')}>
            <span className={['absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', isDistantLesson ? 'left-[22px]' : 'left-0.5'].join(' ')} />
          </button>
        </div>
        {isDistantLesson && (
          <input type="text" defaultValue="" placeholder="Заметка (учитель на больничном…)"
            onBlur={async e => { await adminApi.setDistant({ date, className, lessonNumber: number, note: e.target.value || null }); onSaved(); }}
            className="mt-2 w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[13px]" />
        )}
        {!isDistantLesson && !isWholeDayDistant && (
          <input type="text" value={distantNote} onChange={e => setDistantNote(e.target.value)} placeholder="Заметка при включении"
            className="mt-2 w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[13px]" />
        )}
      </div>

      <div className="px-6 py-4 border-t border-line-light dark:border-line-dark">
        <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark font-semibold text-[13px]">Закрыть</button>
      </div>
    </aside>
  );
}

function ClassActions({ className, date, wholeDay, onClose, onSaved }: {
  className: string; date: string; wholeDay: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [note, setNote] = useState('');
  const toggle = async () => {
    if (wholeDay) await adminApi.clearDistant({ date, className, lessonNumber: null });
    else await adminApi.setDistant({ date, className, lessonNumber: null, note: note || null });
    onSaved(); onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-30 grid place-items-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-bg-light dark:bg-bg-dark w-full max-w-sm rounded-3xl p-6">
        <div className="text-[11px] font-bold tracking-[.1em] uppercase text-ink-3-light dark:text-ink-3-dark mb-1">Действия для класса</div>
        <h3 className="font-serif text-[26px] -tracking-[.01em] font-normal">{className}</h3>
        <div className="mt-5">
          <div className="text-[13px] font-semibold mb-1.5">Весь день дистанционно</div>
          {!wholeDay && <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Причина (напр., актировка)" className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[13px] mb-2" />}
          <button onClick={toggle}
            className={['w-full py-2.5 rounded-xl font-semibold text-[13.5px]',
              wholeDay ? 'bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-ink-light dark:text-ink-dark'
                       : 'bg-distant dark:bg-distant-dark text-white'].join(' ')}>
            {wholeDay ? 'Убрать дистант' : 'Пометить весь день дистантом'}
          </button>
        </div>
        <button onClick={onClose} className="mt-3 w-full py-2 text-[13px] text-ink-2-light dark:text-ink-2-dark">Закрыть</button>
      </div>
    </div>
  );
}

function NumberActions({ number, date, classes, distantSet, onClose, onSaved }: {
  number: number; date: string; classes: string[]; distantSet: Map<string, string | null>;
  onClose: () => void; onSaved: () => void;
}) {
  const allDistant = classes.every(c => distantSet.has(`${c}::${number}`));
  const [note, setNote] = useState('');
  const toggle = async () => {
    if (allDistant) for (const c of classes) await adminApi.clearDistant({ date, className: c, lessonNumber: number });
    else await adminApi.setDistantAllClasses({ date, lessonNumber: number, note: note || null });
    onSaved(); onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/40 z-30 grid place-items-center p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-bg-light dark:bg-bg-dark w-full max-w-sm rounded-3xl p-6">
        <div className="text-[11px] font-bold tracking-[.1em] uppercase text-ink-3-light dark:text-ink-3-dark mb-1">Действия для урока</div>
        <h3 className="font-serif text-[26px] -tracking-[.01em] font-normal">{number}-й урок · все классы</h3>
        <div className="mt-5">
          {!allDistant && <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="Заметка" className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[13px] mb-2" />}
          <button onClick={toggle} className={['w-full py-2.5 rounded-xl font-semibold text-[13.5px]',
            allDistant ? 'bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark' : 'bg-distant dark:bg-distant-dark text-white'].join(' ')}>
            {allDistant ? 'Снять дистант со всех' : 'Все классы дистанционно'}
          </button>
        </div>
        <button onClick={onClose} className="mt-3 w-full py-2 text-[13px] text-ink-2-light dark:text-ink-2-dark">Закрыть</button>
      </div>
    </div>
  );
}

