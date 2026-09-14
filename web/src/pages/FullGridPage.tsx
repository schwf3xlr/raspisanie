import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { DayAllResponse } from '../lib/types';
import SchoolLogo from '../components/SchoolLogo';
import { addDays, fmtDate, fromISODate, isSameDate, mondayOf, toISODate } from '../lib/time';
import { useMinuteTick } from '../lib/hooks';

export default function FullGridPage() {
  useMinuteTick();
  const [dateIso, setDateIso] = useState<string>(() => {
    const t = new Date();
    const dow = t.getDay();
    return dow >= 1 && dow <= 5 ? toISODate(t) : toISODate(mondayOf(t));
  });
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

  const workdays = useMemo(() => {
    const m = mondayOf(fromISODate(dateIso));
    return Array.from({ length: 5 }, (_, i) => addDays(m, i));
  }, [dateIso]);

  const cellByKey = useMemo(() => {
    const m = new Map<string, DayAllResponse['cells'][number]>();
    if (data) for (const c of data.cells) m.set(`${c.className}::${c.number}`, c);
    return m;
  }, [data]);

  const today = new Date();

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark flex flex-col">
      <header className="px-4 md:px-8 py-4 border-b border-line-light dark:border-line-dark flex items-center gap-3 flex-wrap">
        <Link to="/app" className="flex items-center gap-2.5 text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark">
          <SchoolLogo size={26} className="rounded-lg" />
          <span className="font-semibold text-[14px]">Расписание СОШ №44</span>
        </Link>
        <span className="text-ink-3-light dark:text-ink-3-dark text-[12.5px]">·</span>
        <span className="text-[13.5px] font-semibold">Общая таблица</span>

        <div className="ml-auto flex items-center gap-1 bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-full p-0.5">
          {workdays.map(d => {
            const iso = toISODate(d);
            const on = iso === dateIso;
            const isToday = isSameDate(d, today);
            const dowShort = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'][d.getDay() - 1];
            return (
              <button key={iso} onClick={() => setDateIso(iso)}
                className={[
                  'px-2.5 md:px-3.5 py-1.5 rounded-full text-[12.5px] font-semibold tabular-nums transition-colors flex items-center gap-1.5',
                  on
                    ? 'bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark'
                    : 'text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark',
                ].join(' ')}
              >
                {dowShort} {d.getDate()}
                {isToday && <span className={['w-1 h-1 rounded-full', on ? 'bg-white' : 'bg-accent dark:bg-accent-dark'].join(' ')} />}
              </button>
            );
          })}
        </div>
      </header>

      <div className="px-4 md:px-8 pt-4">
        <div className="text-[13px] text-ink-2-light dark:text-ink-2-dark">
          {data ? (
            <>
              <span className="font-serif text-[24px] md:text-[30px] -tracking-[.01em] text-ink-light dark:text-ink-dark">
                {data.day ?? 'Выходной'}
              </span>
              <span className="ml-3 tabular-nums">{fmtDate(fromISODate(dateIso))}</span>
              {!data.published && (
                <span className="ml-3 inline-flex items-center gap-1.5 bg-line-light dark:bg-line-dark text-ink-2-light dark:text-ink-2-dark px-2 py-0.5 rounded-full text-[11.5px] font-semibold">
                  Не опубликовано
                </span>
              )}
            </>
          ) : loading ? 'Загружаем…' : ''}
        </div>
      </div>

      {error && !data && <div className="p-10 text-red-500">{error}</div>}

      {data && (
        <div className="flex-1 overflow-auto mt-3">
          <table className="min-w-full border-separate" style={{ borderSpacing: 0 }}>
            <thead className="sticky top-0 z-20 bg-bg-light dark:bg-bg-dark">
              <tr>
                <th className="sticky left-0 z-30 bg-bg-light dark:bg-bg-dark px-3 py-2 border-b border-r border-line-light dark:border-line-dark text-[11px] font-bold tracking-[.08em] uppercase text-ink-3-light dark:text-ink-3-dark min-w-[90px]">
                  Класс
                </th>
                {data.numbers.map(n => {
                  const t = data.timeByNumber.find(x => x.number === n);
                  return (
                    <th key={n} className="px-3 py-2 border-b border-r border-line-light dark:border-line-dark text-center min-w-[150px] max-w-[200px]">
                      <div className="font-serif text-[16px] leading-none tabular-nums">{n}</div>
                      <div className="text-[10.5px] text-ink-3-light dark:text-ink-3-dark tabular-nums mt-1 font-medium">
                        {t?.timeStart}
                        {t?.timeEnd && <> - {t.timeEnd}</>}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {data.classes.map(cls => {
                const wholeDayDistant = data.distantAllDayByClass[cls] !== undefined;
                return (
                  <tr key={cls}>
                    <th className="sticky left-0 z-10 bg-bg-light dark:bg-bg-dark px-3 py-2 border-b border-r border-line-light dark:border-line-dark text-left font-serif text-[17px] font-medium tabular-nums">
                      {cls}
                      {wholeDayDistant && (
                        <span className="ml-2 align-middle inline-block text-[9px] font-bold uppercase tracking-wider text-distant dark:text-distant-dark bg-distant-soft dark:bg-distant-soft-dark px-1.5 py-px rounded">
                          Дист
                        </span>
                      )}
                    </th>
                    {data.numbers.map(n => {
                      const c = cellByKey.get(`${cls}::${n}`);
                      const l = c?.lesson;
                      if (!l) {
                        return (
                          <td key={n} className="border-b border-r border-line-light dark:border-line-dark px-2 py-2 align-top text-ink-3-light dark:text-ink-3-dark text-[11.5px] italic text-center">
                            {data.published ? '-' : ''}
                          </td>
                        );
                      }
                      return (
                        <td key={n} className={[
                          'border-b border-r border-line-light dark:border-line-dark px-2 py-2 align-top',
                          l.fromOverride ? 'bg-accent-soft/40 dark:bg-accent-soft-dark/40' : '',
                          l.distant ? 'bg-distant-soft dark:bg-distant-soft-dark' : '',
                        ].join(' ')}>
                          {l.groups.map((g, gi) => (
                            <div key={gi} className={gi > 0 ? 'mt-1.5 pt-1.5 border-t border-dashed border-line-light dark:border-line-dark' : ''}>
                              <div className="text-[13px] font-semibold leading-tight">{g.subject}</div>
                              <div className="text-[11.5px] text-ink-2-light dark:text-ink-2-dark mt-0.5 flex gap-1.5 items-center flex-wrap">
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
