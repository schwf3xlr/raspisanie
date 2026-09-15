import { useMemo, useState } from 'react';
import { adminApi, type AdminOverride, type AdminTemplateLesson } from '../../lib/admin-api';

interface Props {
  date: string;                // ISO
  dateLabel: string;           // "Понедельник, 15 сентября"
  timeSlots: Array<{ number: number; timeStart: string; timeEnd: string }>;
  template: AdminTemplateLesson[];
  overrides: AdminOverride[];
  onClose: () => void;
  onSaved: () => void;
}

interface Row {
  number: number;
  templateStart: string;
  templateEnd: string;
  currentStart: string;      // то, что реально применится сейчас (override приоритет)
  currentEnd: string;
  timeStart: string;         // редактируемое
  timeEnd: string;
  overridden: boolean;       // сейчас есть override с нестандартным временем
}

// Модалка «Звонки на день» - меняет время звонков только на выбранную дату,
// применяется сразу ко всем классам. Стандартные звонки не трогает.
export default function DayBellsModal({ date, dateLabel, timeSlots, template, overrides, onClose, onSaved }: Props) {
  const initial = useMemo<Row[]>(() => {
    const slotByNum = new Map(timeSlots.map(s => [s.number, s]));
    // Все номера уроков, которые есть в этот день: из timeSlots + шаблона + overrides.
    const nums = new Set<number>();
    for (const s of timeSlots) nums.add(s.number);
    for (const t of template) nums.add(t.number);
    for (const o of overrides) nums.add(o.number);
    const sorted = [...nums].sort((a, b) => a - b);

    // По каждому номеру ищем override с нестандартным временем в любом классе -
    // если такой есть, отображаем это время как «текущее».
    const overrideTimeByNum = new Map<number, { timeStart: string; timeEnd: string }>();
    for (const o of overrides) {
      const slot = slotByNum.get(o.number);
      const isCustom = !!slot && (o.timeStart !== slot.timeStart || o.timeEnd !== slot.timeEnd);
      if (isCustom && !overrideTimeByNum.has(o.number)) {
        overrideTimeByNum.set(o.number, { timeStart: o.timeStart, timeEnd: o.timeEnd });
      }
    }

    return sorted.map(n => {
      const slot = slotByNum.get(n);
      const tplStart = slot?.timeStart ?? '';
      const tplEnd = slot?.timeEnd ?? '';
      const cust = overrideTimeByNum.get(n);
      const curStart = cust?.timeStart ?? tplStart;
      const curEnd = cust?.timeEnd ?? tplEnd;
      return {
        number: n,
        templateStart: tplStart,
        templateEnd: tplEnd,
        currentStart: curStart,
        currentEnd: curEnd,
        timeStart: curStart,
        timeEnd: curEnd,
        overridden: !!cust,
      };
    });
  }, [timeSlots, template, overrides]);

  const [rows, setRows] = useState<Row[]>(initial);
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setField = (idx: number, patch: Partial<Pick<Row, 'timeStart' | 'timeEnd'>>) => {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };
  const resetRow = (idx: number) => {
    setRows(rs => rs.map((r, i) => i === idx ? { ...r, timeStart: r.templateStart, timeEnd: r.templateEnd } : r));
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const changed = rows
        .filter(r => r.timeStart !== r.currentStart || r.timeEnd !== r.currentEnd)
        .map(r => ({ number: r.number, timeStart: r.timeStart, timeEnd: r.timeEnd }));
      if (changed.length === 0) { onClose(); return; }
      await adminApi.setDayBells({ date, rows: changed });
      if (notify) {
        await adminApi.pushBroadcast({
          title: 'Изменены звонки',
          body: `На ${dateLabel.toLowerCase()} изменено время уроков. Загляните в расписание.`,
          kind: 'changes',
        }).catch(err => console.warn('pushBroadcast failed:', err));
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setBusy(false); }
  };

  const anyDirty = rows.some(r => r.timeStart !== r.currentStart || r.timeEnd !== r.currentEnd);

  return (
    <div className="fixed inset-0 bg-black/40 z-40 flex items-end sm:items-center justify-center sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-bg-light dark:bg-bg-dark w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 sm:p-7 max-h-[92vh] overflow-y-auto">
        <div className="sm:hidden pb-3 flex justify-center -mt-1"><div className="w-10 h-1 rounded-full bg-line-light dark:bg-line-dark" /></div>
        <h2 className="font-serif text-[22px] sm:text-[26px] -tracking-[.01em] font-normal">Звонки на {dateLabel.toLowerCase()}</h2>
        <p className="text-ink-2-light dark:text-ink-2-dark text-[13px] mt-1 mb-4">
          Изменения применятся <b className="text-ink-light dark:text-ink-dark">только к этому дню</b> и ко всем классам.
          Стандартные звонки не меняются - редактируются в «Стандартном расписании».
        </p>

        <div className="space-y-2 mb-5">
          {rows.map((r, i) => {
            const dirty = r.timeStart !== r.currentStart || r.timeEnd !== r.currentEnd;
            return (
              <div key={r.number} className="flex items-center gap-1.5 sm:gap-2">
                <div className="w-6 sm:w-7 shrink-0 font-serif text-[16px] sm:text-[18px] font-medium text-ink-2-light dark:text-ink-2-dark tabular-nums text-center">
                  {r.number}
                </div>
                <input type="text" value={r.timeStart} onChange={e => setField(i, { timeStart: e.target.value })}
                  placeholder={r.templateStart || '8:10'} inputMode="numeric"
                  className={[
                    'flex-1 min-w-0 border rounded-lg px-2 py-2 text-[14px] tabular-nums text-center focus:outline-none',
                    dirty
                      ? 'bg-accent-soft dark:bg-accent-soft-dark border-accent/40 dark:border-accent-dark/40 focus:border-accent dark:focus:border-accent-dark'
                      : 'bg-panel-light dark:bg-panel-dark border-line-light dark:border-line-dark focus:border-ink-light dark:focus:border-ink-dark',
                  ].join(' ')} />
                <div className="text-ink-3-light dark:text-ink-3-dark shrink-0 text-[13px]">-</div>
                <input type="text" value={r.timeEnd} onChange={e => setField(i, { timeEnd: e.target.value })}
                  placeholder={r.templateEnd || '8:50'} inputMode="numeric"
                  className={[
                    'flex-1 min-w-0 border rounded-lg px-2 py-2 text-[14px] tabular-nums text-center focus:outline-none',
                    dirty
                      ? 'bg-accent-soft dark:bg-accent-soft-dark border-accent/40 dark:border-accent-dark/40 focus:border-accent dark:focus:border-accent-dark'
                      : 'bg-panel-light dark:bg-panel-dark border-line-light dark:border-line-dark focus:border-ink-light dark:focus:border-ink-dark',
                  ].join(' ')} />
                {(r.overridden || dirty) && (
                  <button type="button" onClick={() => resetRow(i)}
                    title="Вернуть к стандарту"
                    className="shrink-0 text-[10.5px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark hover:text-ink-light dark:hover:text-ink-dark px-1.5">
                    ↺
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="mb-3 text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-3 py-2.5">{error}</div>
        )}

        {anyDirty && (
          <label className="flex items-start gap-3 cursor-pointer select-none mb-4 pt-1">
            <input
              type="checkbox"
              checked={notify}
              onChange={e => setNotify(e.target.checked)}
              className="mt-1 w-4 h-4 accent-accent"
            />
            <div className="flex-1">
              <div className="text-[13.5px] font-semibold">Отправить push об изменении звонков</div>
              <div className="text-ink-3-light dark:text-ink-3-dark text-[12px] mt-0.5">
                Дойдёт до устройств, у которых включён тип «Замены и изменения звонков».
              </div>
            </div>
          </label>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button onClick={onClose} disabled={busy}
            className="col-span-2 sm:col-span-1 py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13px] font-semibold disabled:opacity-50">
            Отмена
          </button>
          <button onClick={save} disabled={busy || !anyDirty}
            className="sm:col-span-2 py-2.5 rounded-xl bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark text-[13px] font-semibold disabled:opacity-50">
            {busy ? 'Сохраняем…' : anyDirty ? 'Сохранить на этот день' : 'Нет изменений'}
          </button>
        </div>
      </div>
    </div>
  );
}
