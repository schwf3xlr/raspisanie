import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { DayAllResponse } from '../lib/types';
import SchoolLogo from '../components/SchoolLogo';
import { addDays, fmtDate, fmtWeekLabel, fromISODate, isSameDate, mondayOf, toISODate } from '../lib/time';
import { useMinuteTick } from '../lib/hooks';

export default function FullGridPage() {
  useMinuteTick();

  const [dateIso, setDateIso] = useState<string>(() => {
    const t = new Date();
    const dow = t.getDay();
    return dow >= 1 && dow <= 5 ? toISODate(t) : toISODate(mondayOf(t));
  });
  const monday = useMemo(() => mondayOf(fromISODate(dateIso)), [dateIso]);

  const [data, setData] = useState<DayAllResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true); setError(null);
    api.dayAll(dateIso)
      .then(setData)
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [dateIso]);

  const workdays = useMemo(
    () => Array.from({ length: 5 }, (_, i) => addDays(monday, i)),
    [monday],
  );

  const cellByKey = useMemo(() => {
    const m = new Map<string, DayAllResponse['cells'][number]>();
    if (data) for (const c of data.cells) m.set(`${c.className}::${c.number}`, c);
    return m;
  }, [data]);

  const today = new Date();

  const goPrevWeek = () => setDateIso(toISODate(addDays(monday, -7)));
  const goNextWeek = () => setDateIso(toISODate(addDays(monday, 7)));
  const goToday = () => {
    const t = new Date();
    const dow = t.getDay();
    setDateIso(dow >= 1 && dow <= 5 ? toISODate(t) : toISODate(mondayOf(t)));
  };

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col">
      <header className="px-3 md:px-8 py-3 md:py-4 border-b border-line-light dark:border-line-dark flex items-center gap-3">
        <Link to="/app"
          className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-line-light dark:border-line-dark text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark hover:bg-panel-light dark:hover:bg-panel-dark font-semibold text-[13px]">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6"/></svg>
          <span className="hidden sm:inline">К моему расписанию</span>
          <span className="sm:hidden">Назад</span>
        </Link>
        <div className="min-w-0 flex items-center gap-2.5">
          <SchoolLogo size={24} className="rounded-lg hidden sm:block" />
          <span className="font-semibold text-[14px] hidden md:inline">Расписание СОШ №44</span>
          <span className="text-ink-3-light dark:text-ink-3-dark text-[12.5px] hidden md:inline">·</span>
          <span className="text-[14px] font-semibold truncate">Общая таблица</span>
        </div>
      </header>

      {/* Навигация по неделям и дням недели */}
      <div className="px-3 md:px-8 pt-3 md:pt-4">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={goPrevWeek} aria-label="Предыдущая неделя"
            className="w-9 h-9 rounded-xl border border-line-light dark:border-line-dark grid place-items-center text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark hover:bg-panel-light dark:hover:bg-panel-dark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
          </button>
          <button onClick={goToday}
            className="text-[13.5px] font-semibold text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark tabular-nums px-2">
            {fmtWeekLabel(monday)}
          </button>
          <button onClick={goNextWeek} aria-label="Следующая неделя"
            className="w-9 h-9 rounded-xl border border-line-light dark:border-line-dark grid place-items-center text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark hover:bg-panel-light dark:hover:bg-panel-dark">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 6l6 6-6 6"/></svg>
          </button>
          <div className="ml-auto text-[13px] text-ink-2-light dark:text-ink-2-dark">
            {data && (
              <>
                <span className="font-serif text-[18px] md:text-[22px] -tracking-[.01em] text-ink-light dark:text-ink-dark">
                  {data.day ?? 'Выходной'}
                </span>
                <span className="ml-2 tabular-nums text-[12.5px]">{fmtDate(fromISODate(dateIso))}</span>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-5 gap-1">
          {workdays.map(d => {
            const iso = toISODate(d);
            const on = iso === dateIso;
            const isToday = isSameDate(d, today);
            const dowShort = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'][d.getDay() - 1];
            return (
              <button key={iso} onClick={() => setDateIso(iso)}
                className={[
                  'flex flex-col items-center justify-center gap-0.5 py-2 rounded-2xl border transition-colors text-center',
                  on
                    ? 'bg-ink-light text-bg-light border-ink-light dark:bg-ink-dark dark:text-bg-dark dark:border-ink-dark'
                    : 'bg-transparent border-line-light dark:border-line-dark text-ink-2-light dark:text-ink-2-dark hover:bg-panel-light dark:hover:bg-panel-dark',
                ].join(' ')}
              >
                <div className={['text-[10.5px] font-semibold tracking-[.06em] uppercase leading-none', on ? 'opacity-70' : 'opacity-60'].join(' ')}>
                  {dowShort}
                </div>
                <div className="font-serif text-[18px] font-medium leading-none tabular-nums">
                  {d.getDate()}
                </div>
                <div className="h-1.5 grid place-items-center mt-0.5">
                  {isToday && (
                    <span className={['w-1 h-1 rounded-full', on ? 'bg-white' : 'bg-accent dark:bg-accent-dark'].join(' ')} />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {data && !data.published && (
          <div className="mt-3 inline-flex items-center gap-1.5 bg-line-light dark:bg-line-dark text-ink-2-light dark:text-ink-2-dark px-2.5 py-1 rounded-full text-[11.5px] font-semibold">
            Не опубликовано
          </div>
        )}
        {data?.published && data.bellChanges && data.bellChanges.length > 0 && (
          <div className="mt-3 bg-yellow-50 dark:bg-yellow-950/30 border border-yellow-300/60 dark:border-yellow-800/50 rounded-xl px-3 py-2 flex items-start gap-2.5">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yellow-700 dark:text-yellow-300 shrink-0 mt-0.5"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0"/></svg>
            <div className="text-[12.5px] text-ink-2-light dark:text-ink-2-dark tabular-nums leading-relaxed">
              <b className="text-yellow-800 dark:text-yellow-200">Сегодня изменены звонки:</b>{' '}
              {data.bellChanges.map((b, i) => (
                <span key={b.number}>
                  {i > 0 && ' · '}
                  <b className="text-ink-light dark:text-ink-dark">{b.number}-й</b> {b.timeStart}-{b.timeEnd}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && !data && <div className="p-10 text-red-500">{error}</div>}
      {loading && !data && !error && <div className="p-10 text-ink-2-light dark:text-ink-2-dark">Загружаем…</div>}

      {data && (
        <div className="flex-1 overflow-auto mt-3">
          {/*
            Оси как в редакторе админа: колонки = классы, строки = уроки.
            Левая колонка «№ + время» sticky на телефоне, шапка с классами - sticky сверху.
          */}
          <table className="min-w-full border-separate" style={{ borderSpacing: 0 }}>
            <thead className="sticky top-0 z-20 bg-bg-light dark:bg-bg-dark">
              <tr>
                <th className="sticky left-0 z-30 bg-bg-light dark:bg-bg-dark px-2 py-2 border-b border-r border-line-light dark:border-line-dark text-[10.5px] font-bold tracking-[.08em] uppercase text-ink-3-light dark:text-ink-3-dark w-[68px] md:w-[92px]">
                  <div>№</div>
                  <div className="text-[10px] font-medium normal-case tracking-normal text-ink-3-light dark:text-ink-3-dark mt-0.5">Время</div>
                </th>
                {data.classes.map(cls => {
                  const wholeDayDistant = data.distantAllDayByClass[cls] !== undefined;
                  return (
                    <th key={cls} className="px-2 py-2 border-b border-r border-line-light dark:border-line-dark text-center min-w-[128px] md:min-w-[150px] max-w-[220px]">
                      <div className="font-serif text-[17px] leading-none tabular-nums font-medium">{cls}</div>
                      {wholeDayDistant && (
                        <div className="mt-1 inline-block text-[9px] font-bold uppercase tracking-wider text-distant dark:text-distant-dark bg-distant-soft dark:bg-distant-soft-dark px-1.5 py-px rounded">
                          Дист
                        </div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.numbers.map(n => {
                const t = data.timeByNumber.find(x => x.number === n);
                return (
                  <tr key={n}>
                    <th className="sticky left-0 z-10 bg-bg-light dark:bg-bg-dark px-2 py-2 border-b border-r border-line-light dark:border-line-dark text-center w-[68px] md:w-[92px]">
                      <div className="font-serif text-[18px] leading-none tabular-nums">{n}</div>
                      <div className="text-[10px] text-ink-3-light dark:text-ink-3-dark tabular-nums mt-1 font-medium leading-tight">
                        {t?.timeStart}
                        {t?.timeEnd && <div className="text-[9.5px] opacity-70">{t.timeEnd}</div>}
                      </div>
                    </th>
                    {data.classes.map(cls => {
                      const c = cellByKey.get(`${cls}::${n}`);
                      const l = c?.lesson;
                      if (!l) {
                        return (
                          <td key={cls} className="border-b border-r border-line-light dark:border-line-dark px-2 py-2 align-top text-ink-3-light dark:text-ink-3-dark text-[11.5px] italic text-center">
                            {data.published ? '-' : ''}
                          </td>
                        );
                      }
                      return (
                        <td key={cls} className={[
                          'border-b border-r border-line-light dark:border-line-dark px-2 py-2 align-top',
                          l.fromOverride ? 'bg-accent-soft/40 dark:bg-accent-soft-dark/40' : '',
                          l.timeOverridden && !l.fromOverride ? 'bg-yellow-100/60 dark:bg-yellow-900/25' : '',
                          l.distant ? 'bg-distant-soft dark:bg-distant-soft-dark' : '',
                        ].join(' ')}>
                          {l.groups.map((g, gi) => (
                            <div key={gi} className={gi > 0 ? 'mt-1.5 pt-1.5 border-t border-dashed border-line-light dark:border-line-dark' : ''}>
                              <div className="text-[12.5px] md:text-[13px] font-semibold leading-tight break-words">{g.subject}</div>
                              <div className="text-[11px] text-ink-2-light dark:text-ink-2-dark mt-0.5 flex gap-1.5 items-center flex-wrap">
                                {l.distant ? (
                                  <span className="text-distant dark:text-distant-dark font-semibold">Онлайн</span>
                                ) : (
                                  g.room && (
                                    <span className="tabular-nums font-semibold text-ink-light dark:text-ink-dark border border-line-light dark:border-line-dark rounded px-1 py-px">{g.room}</span>
                                  )
                                )}
                                {g.teacher && <span className="truncate">{g.teacher}</span>}
                              </div>
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
