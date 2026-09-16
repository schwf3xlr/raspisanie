import { useCallback, useEffect, useState } from 'react';
import { adminApi, type SheetsSync, type SheetsRunResult } from '../../lib/admin-api';

interface Props {
  onClose: () => void;
  onDone?: () => void;
  // Что синхронизируем.
  kind: 'template' | 'schedule';
  // Для template - день недели (Понедельник...Пятница).
  day?: string;
  // Для schedule - ISO дата (YYYY-MM-DD).
  date?: string;
  // Человекочитаемая подпись для шапки: «Понедельник» или «Пятница, 12 сентября».
  targetLabel: string;
}

export default function SheetsPickerModal({ onClose, onDone, kind, day, date, targetLabel }: Props) {
  const [items, setItems] = useState<SheetsSync[] | null>(null);
  const [status, setStatus] = useState<{ configured: boolean; serviceAccountEmail: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [lastRun, setLastRun] = useState<{ id: number; op: 'import' | 'export'; result: SheetsRunResult } | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [st, list] = await Promise.all([
        adminApi.sheetsStatus().catch(() => ({ configured: false, serviceAccountEmail: null })),
        adminApi.sheetsList().catch(() => ({ syncs: [] as SheetsSync[] })),
      ]);
      setStatus(st);
      setItems(list.syncs.filter(x => x.kind === kind));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [kind]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (s: SheetsSync, op: 'import' | 'export') => {
    setBusyId(s.id); setError(null); setLastRun(null);
    try {
      const body = kind === 'template' ? { day } : { date };
      const r = op === 'import'
        ? await adminApi.sheetsImport(s.id, body)
        : await adminApi.sheetsExport(s.id, body);
      setLastRun({ id: s.id, op, result: r.result });
      onDone?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusyId(null); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-bg-light dark:bg-bg-dark w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 max-h-[92vh] overflow-y-auto overscroll-contain">
        <div className="sm:hidden pb-3 flex justify-center -mt-1"><div className="w-10 h-1 rounded-full bg-line-light dark:bg-line-dark" /></div>
        <div className="flex items-start gap-3 mb-1">
          <div className="w-10 h-10 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark grid place-items-center shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/></svg>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-[20px] -tracking-[.01em] leading-tight">Google Таблицы</h2>
            <div className="text-ink-2-light dark:text-ink-2-dark text-[13px] mt-0.5">
              {kind === 'template' ? 'Стандартное расписание · ' : 'Расписание · '}{targetLabel}
            </div>
          </div>
        </div>

        {status && !status.configured && (
          <div className="mt-4 bg-yellow-100 dark:bg-yellow-950/40 border border-yellow-300/60 dark:border-yellow-900/60 text-yellow-900 dark:text-yellow-200 rounded-2xl px-3 py-2.5 text-[13px]">
            Модуль не настроен. См. <a href="/admin/sheets" className="underline underline-offset-2">Google Таблицы</a> в панели.
          </div>
        )}

        {items == null ? (
          <div className="mt-4 text-ink-3-light dark:text-ink-3-dark text-[13.5px]">Загружаем…</div>
        ) : items.length === 0 ? (
          <div className="mt-4 text-ink-3-light dark:text-ink-3-dark text-[13.5px]">
            Нет привязок для «{kind === 'template' ? 'стандартного' : 'обычного'}» расписания.
            <br />
            Заведите её в <a href="/admin/sheets" className="underline underline-offset-2 text-ink-2-light dark:text-ink-2-dark">Google Таблицы</a>.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {items.map(s => {
              const canImport = s.direction !== 'export';
              const canExport = s.direction !== 'import';
              return (
                <div key={s.id} className="border border-line-light dark:border-line-dark rounded-xl p-3">
                  <div className="font-semibold text-[14px] truncate">{s.title || 'Без названия'}</div>
                  <div className="text-[11.5px] text-ink-3-light dark:text-ink-3-dark mt-0.5">
                    {s.direction === 'import' ? 'только импорт' : s.direction === 'export' ? 'только экспорт' : 'в обе стороны'}
                    {s.lastRunAt && <> · последний запуск {new Date(s.lastRunAt).toLocaleString('ru')}</>}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      onClick={() => run(s, 'import')}
                      disabled={!canImport || busyId === s.id}
                      className="py-2 rounded-lg border border-line-light dark:border-line-dark text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark disabled:opacity-40 hover:text-ink-light dark:hover:text-ink-dark"
                    >
                      {busyId === s.id ? 'Работаю…' : '⇣ Импорт'}
                    </button>
                    <button
                      onClick={() => run(s, 'export')}
                      disabled={!canExport || busyId === s.id}
                      className="py-2 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark text-[13px] font-semibold disabled:opacity-40"
                    >
                      {busyId === s.id ? 'Работаю…' : '⇡ Экспорт'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && (
          <div className="mt-3 text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-3 py-2.5">{error}</div>
        )}
        {lastRun && (
          <div className="mt-3 border border-line-light dark:border-line-dark rounded-xl p-3">
            <div className="font-semibold text-[13px]">Результат {lastRun.op === 'import' ? 'импорта' : 'экспорта'}:</div>
            <div className="text-[13px] text-ink-2-light dark:text-ink-2-dark mt-0.5">
              {[
                lastRun.result.lessons != null && `уроков: ${lastRun.result.lessons}`,
                lastRun.result.timeSlots != null && lastRun.result.timeSlots > 0 && `звонков: ${lastRun.result.timeSlots}`,
                lastRun.result.sheetsWritten != null && `листов: ${lastRun.result.sheetsWritten}`,
                lastRun.result.distantMarks != null && lastRun.result.distantMarks > 0 && `дистант: ${lastRun.result.distantMarks}`,
              ].filter(Boolean).join(', ') || 'OK'}
            </div>
            {lastRun.result.warnings && lastRun.result.warnings.length > 0 && (
              <ul className="mt-1 text-[12px] text-yellow-800 dark:text-yellow-300 space-y-0.5">
                {lastRun.result.warnings.map((w, i) => <li key={i}>· {w}</li>)}
              </ul>
            )}
          </div>
        )}

        <button
          onClick={onClose}
          className="mt-4 w-full py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark font-semibold text-[14px]"
        >
          Закрыть
        </button>
      </div>
    </div>
  );
}
