import { useCallback, useEffect, useState } from 'react';
import { adminApi, type SheetsSync, type SheetsRunResult } from '../../lib/admin-api';
import { confirmDialog } from '../../lib/dialog';
import { mondayOf, toISODate, fmtWeekLabel } from '../../lib/time';

type Kind = 'template' | 'schedule';
type Direction = 'import' | 'export' | 'both';

export default function AdminSheets() {
  const [status, setStatus] = useState<{ configured: boolean; serviceAccountEmail: string | null } | null>(null);
  const [items, setItems] = useState<SheetsSync[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [lastRun, setLastRun] = useState<{ id: number; op: 'import' | 'export'; result: SheetsRunResult } | null>(null);
  const [creating, setCreating] = useState(false);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [st, list] = await Promise.all([
        adminApi.sheetsStatus(),
        adminApi.sheetsList(),
      ]);
      setStatus(st);
      setItems(list.syncs);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const flash = (m: string) => { setNotice(m); setTimeout(() => setNotice(null), 5000); };

  // ---- Форма создания ----
  const [nKind, setNKind] = useState<Kind>('template');
  const [nDir, setNDir] = useState<Direction>('both');
  const [nSid, setNSid] = useState('');
  const [nTitle, setNTitle] = useState('');

  const createSync = async () => {
    setError(null);
    try {
      const spreadsheetId = extractSpreadsheetId(nSid.trim());
      if (!spreadsheetId) { setError('Некорректная ссылка на таблицу или ID.'); return; }
      await adminApi.sheetsCreate({ kind: nKind, direction: nDir, spreadsheetId, title: nTitle.trim() || undefined });
      setNKind('template'); setNDir('both'); setNSid(''); setNTitle('');
      setCreating(false);
      flash('Привязка добавлена.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const del = async (s: SheetsSync) => {
    const ok = await confirmDialog({
      title: 'Удалить привязку?',
      message: 'Сама таблица в Google не меняется. Просто исчезнет из списка.',
      confirmText: 'Удалить', danger: true,
    });
    if (!ok) return;
    try { await adminApi.sheetsDelete(s.id); await refresh(); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
  };

  const [weekPrompt, setWeekPrompt] = useState<{ id: number; op: 'import' | 'export' } | null>(null);
  const [weekStart, setWeekStart] = useState<string>(() => toISODate(mondayOf(new Date())));

  const runOperation = async (s: SheetsSync, op: 'import' | 'export') => {
    if (s.kind === 'schedule') {
      // Спросим неделю.
      setWeekPrompt({ id: s.id, op });
      return;
    }
    setBusyId(s.id); setError(null); setLastRun(null);
    try {
      const r = op === 'import'
        ? await adminApi.sheetsImport(s.id, {})
        : await adminApi.sheetsExport(s.id, {});
      setLastRun({ id: s.id, op, result: r.result });
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusyId(null); }
  };

  const runWithWeek = async () => {
    if (!weekPrompt || !items) return;
    const s = items.find(x => x.id === weekPrompt.id);
    if (!s) return;
    setBusyId(s.id); setError(null); setLastRun(null);
    try {
      const r = weekPrompt.op === 'import'
        ? await adminApi.sheetsImport(s.id, { weekStart })
        : await adminApi.sheetsExport(s.id, { weekStart });
      setLastRun({ id: s.id, op: weekPrompt.op, result: r.result });
      setWeekPrompt(null);
      await refresh();
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusyId(null); }
  };

  return (
    <div className="min-h-screen">
      <header className="px-4 md:px-8 pt-6 md:pt-8 pb-5 border-b border-line-light dark:border-line-dark">
        <h1 className="font-serif text-[28px] md:text-[36px] -tracking-[.02em] leading-none font-normal">Google Таблицы</h1>
        <p className="text-ink-2-light dark:text-ink-2-dark text-[13.5px] mt-1.5">
          Синхронизация расписания с таблицами Google. Формат листов — <a href="/SHEETS.md" target="_blank" rel="noreferrer" className="underline underline-offset-2">см. SHEETS.md</a>.
        </p>
      </header>

      <div className="px-4 md:px-8 py-6 space-y-6 max-w-4xl">
        {status && !status.configured && (
          <div className="bg-yellow-100 dark:bg-yellow-950/40 border border-yellow-300/60 dark:border-yellow-900/60 text-yellow-900 dark:text-yellow-200 rounded-2xl p-4 text-[13.5px]">
            <b>Модуль не сконфигурирован.</b> На сервере в <code>.env</code> задайте
            <code className="block bg-yellow-50 dark:bg-yellow-950/60 mt-1 p-1.5 rounded text-[12.5px]">GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE=/home/deploy/raspisanie/api/fcm-service-account.json</code>
            (или отдельный ключ), затем перезапустите бэкенд. Подробнее — SHEETS.md.
          </div>
        )}
        {status?.configured && status.serviceAccountEmail && (
          <div className="bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-2xl p-4 text-[13px]">
            <div className="mb-1"><b>Расшарьте таблицу этому e-mail как редактору:</b></div>
            <code className="font-mono text-[12.5px] break-all">{status.serviceAccountEmail}</code>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-300/60 dark:border-red-900/60 text-red-700 dark:text-red-400 rounded-xl px-3 py-2.5 text-[13.5px]">
            {error}
          </div>
        )}
        {notice && (
          <div className="bg-green-50 dark:bg-green-950/40 border border-green-300/60 dark:border-green-900/60 text-green-700 dark:text-green-400 rounded-xl px-3 py-2.5 text-[13.5px]">
            {notice}
          </div>
        )}
        {lastRun && (
          <RunResultCard run={lastRun} />
        )}

        {!creating && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[13.5px] hover:opacity-90"
          >
            + Новая привязка
          </button>
        )}

        {creating && (
          <div className="border border-line-light dark:border-line-dark rounded-2xl p-5">
            <div className="text-[14px] font-semibold mb-3">Новая привязка</div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="block">
                <div className="text-[11.5px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark mb-1">Что синхронизируем</div>
                <select value={nKind} onChange={e => setNKind(e.target.value as Kind)}
                  className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px]">
                  <option value="template">Стандартное расписание (по дням недели)</option>
                  <option value="schedule">Расписание на неделю (замены)</option>
                </select>
              </label>
              <label className="block">
                <div className="text-[11.5px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark mb-1">Направление</div>
                <select value={nDir} onChange={e => setNDir(e.target.value as Direction)}
                  className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px]">
                  <option value="import">Только импорт (из Google → в приложение)</option>
                  <option value="export">Только экспорт (из приложения → в Google)</option>
                  <option value="both">В обе стороны</option>
                </select>
              </label>
              <label className="block md:col-span-2">
                <div className="text-[11.5px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark mb-1">Ссылка или ID таблицы</div>
                <input value={nSid} onChange={e => setNSid(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/1AbCd…/edit  или  1AbCd…"
                  className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[13px] break-all" />
              </label>
              <label className="block md:col-span-2">
                <div className="text-[11.5px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark mb-1">Название (для себя)</div>
                <input value={nTitle} onChange={e => setNTitle(e.target.value)}
                  placeholder="Основное расписание — 2026/2027"
                  className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px]" />
              </label>
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => { setCreating(false); setError(null); }} className="px-4 py-2 rounded-lg bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13.5px] font-semibold">Отмена</button>
              <button onClick={createSync} disabled={!nSid.trim()} className="px-4 py-2 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark text-[13.5px] font-semibold disabled:opacity-50">Создать</button>
            </div>
          </div>
        )}

        {items == null ? (
          <div className="text-ink-2-light dark:text-ink-2-dark text-[14px]">Загружаем…</div>
        ) : items.length === 0 ? (
          <div className="text-ink-3-light dark:text-ink-3-dark text-[14px]">Пока ни одной привязки.</div>
        ) : (
          <div className="space-y-3">
            {items.map(s => (
              <SyncCard key={s.id} sync={s} busy={busyId === s.id}
                onRun={runOperation} onDelete={del} />
            ))}
          </div>
        )}
      </div>

      {weekPrompt && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={e => { if (e.target === e.currentTarget) setWeekPrompt(null); }}>
          <div className="bg-bg-light dark:bg-bg-dark w-full max-w-sm rounded-3xl p-6">
            <h3 className="font-serif text-[22px] mb-1">Выберите неделю</h3>
            <p className="text-ink-2-light dark:text-ink-2-dark text-[13px] mb-4">
              {weekPrompt.op === 'import' ? 'Импорт применит расписание из таблицы на выбранную рабочую неделю.' : 'Экспорт выгрузит расписание за выбранную неделю в таблицу.'}
            </p>
            <input type="date" value={weekStart} onChange={e => setWeekStart(toISODate(mondayOf(new Date(e.target.value))))}
              className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px] tabular-nums" />
            <div className="text-[11.5px] text-ink-3-light dark:text-ink-3-dark mt-1.5">
              Будет применено к рабочим дням недели: {fmtWeekLabel(mondayOf(new Date(weekStart)))}
            </div>
            <div className="flex gap-2 mt-4">
              <button onClick={() => setWeekPrompt(null)} className="flex-1 py-2.5 rounded-lg bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13.5px] font-semibold">Отмена</button>
              <button onClick={runWithWeek} disabled={busyId != null} className="flex-1 py-2.5 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark text-[13.5px] font-semibold disabled:opacity-50">
                {busyId != null ? 'Работаю…' : (weekPrompt.op === 'import' ? 'Импортировать' : 'Экспортировать')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SyncCard({ sync, busy, onRun, onDelete }: {
  sync: SheetsSync;
  busy: boolean;
  onRun: (s: SheetsSync, op: 'import' | 'export') => void;
  onDelete: (s: SheetsSync) => void;
}) {
  const canImport = sync.direction !== 'export';
  const canExport = sync.direction !== 'import';
  return (
    <div className="border border-line-light dark:border-line-dark rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="font-semibold text-[15px]">{sync.title || 'Без названия'}</div>
          <div className="text-[11.5px] text-ink-3-light dark:text-ink-3-dark mt-0.5 flex gap-2 flex-wrap">
            <span>{sync.kind === 'template' ? 'Стандартное расписание' : 'Расписание на неделю'}</span>
            <span>·</span>
            <span>
              {sync.direction === 'import' ? 'только импорт' : sync.direction === 'export' ? 'только экспорт' : 'в обе стороны'}
            </span>
          </div>
          <a href={`https://docs.google.com/spreadsheets/d/${sync.spreadsheetId}/edit`} target="_blank" rel="noreferrer"
            className="inline-block mt-1 text-[12px] font-mono text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark underline underline-offset-2 break-all">
            {sync.spreadsheetId} ↗
          </a>
          {sync.lastRunAt && (
            <div className="text-[11.5px] text-ink-3-light dark:text-ink-3-dark mt-2 tabular-nums">
              Последний запуск: {new Date(sync.lastRunAt).toLocaleString('ru')}. {sync.lastResult}
            </div>
          )}
        </div>
        <button onClick={() => onDelete(sync)} className="text-[12px] font-semibold text-red-500 hover:text-red-600 dark:hover:text-red-400 shrink-0">Удалить</button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          onClick={() => onRun(sync, 'import')}
          disabled={!canImport || busy}
          className="py-2 rounded-lg border border-line-light dark:border-line-dark text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark disabled:opacity-40 hover:text-ink-light dark:hover:text-ink-dark"
        >
          {busy ? 'Работаю…' : '⇣ Импортировать'}
        </button>
        <button
          onClick={() => onRun(sync, 'export')}
          disabled={!canExport || busy}
          className="py-2 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark text-[13px] font-semibold disabled:opacity-40"
        >
          {busy ? 'Работаю…' : '⇡ Экспортировать'}
        </button>
      </div>
    </div>
  );
}

function RunResultCard({ run }: { run: { id: number; op: 'import' | 'export'; result: SheetsRunResult } }) {
  const r = run.result;
  const rows: string[] = [];
  if (r.lessons != null) rows.push(`уроков: ${r.lessons}`);
  if (r.timeSlots != null && r.timeSlots > 0) rows.push(`звонков: ${r.timeSlots}`);
  if (r.sheetsWritten != null) rows.push(`листов записано: ${r.sheetsWritten}`);
  if (r.distantMarks != null && r.distantMarks > 0) rows.push(`дистантных дней: ${r.distantMarks}`);
  return (
    <div className="border border-line-light dark:border-line-dark rounded-2xl p-4">
      <div className="font-semibold text-[13.5px]">Результат {run.op === 'import' ? 'импорта' : 'экспорта'}:</div>
      <div className="text-[13px] text-ink-2-light dark:text-ink-2-dark mt-1">{rows.join(', ') || 'OK'}</div>
      {r.warnings && r.warnings.length > 0 && (
        <ul className="mt-2 text-[12.5px] text-yellow-800 dark:text-yellow-300 space-y-1">
          {r.warnings.map((w, i) => <li key={i}>· {w}</li>)}
        </ul>
      )}
    </div>
  );
}

// Извлекает ID таблицы из URL или возвращает исходную строку, если это уже ID.
function extractSpreadsheetId(input: string): string | null {
  if (!input) return null;
  const m = input.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  if (m) return m[1]!;
  if (/^[a-zA-Z0-9_-]+$/.test(input) && input.length > 20) return input;
  return null;
}
