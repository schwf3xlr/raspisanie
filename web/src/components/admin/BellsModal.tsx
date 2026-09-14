import { useState } from 'react';
import { adminApi } from '../../lib/admin-api';

interface Props {
  day: string;
  initial: Array<{ number: number; timeStart: string; timeEnd: string }>;
  onClose: () => void;
}

export default function BellsModal({ day, initial, onClose }: Props) {
  const [rows, setRows] = useState(() => {
    const map = new Map<number, { timeStart: string; timeEnd: string }>();
    for (const r of initial) map.set(r.number, { timeStart: r.timeStart, timeEnd: r.timeEnd });
    const upTo = Math.max(8, ...initial.map(r => r.number));
    return Array.from({ length: upTo }, (_, i) => {
      const n = i + 1;
      return { number: n, ...(map.get(n) ?? { timeStart: '', timeEnd: '' }) };
    });
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      for (const r of rows) {
        if (r.timeStart && r.timeEnd) {
          await adminApi.saveTimeSlot({ day, number: r.number, timeStart: r.timeStart, timeEnd: r.timeEnd });
        }
      }
      onClose();
    } finally { setBusy(false); }
  };

  const applyDefaults = async () => {
    setBusy(true);
    try { await adminApi.resetTimeSlots(day); onClose(); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-30 flex items-end sm:items-center justify-center sm:p-4" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-bg-light dark:bg-bg-dark w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 sm:p-7 max-h-[92vh] overflow-y-auto">
        <div className="sm:hidden pb-3 flex justify-center -mt-1"><div className="w-10 h-1 rounded-full bg-line-light dark:bg-line-dark" /></div>
        <h2 className="font-serif text-[22px] sm:text-[26px] -tracking-[.01em] font-normal">Звонки на {day.toLowerCase()}</h2>
        <p className="text-ink-2-light dark:text-ink-2-dark text-[13px] mt-1 mb-4">
          Время сразу применится к урокам этого дня недели во всех неделях.
          Чтобы изменить звонок только на конкретный день - откройте нужный урок в «Расписании».
        </p>
        <div className="space-y-2 mb-5">
          {rows.map((r, i) => (
            <div key={r.number} className="flex items-center gap-1.5 sm:gap-2">
              <div className="w-6 sm:w-7 shrink-0 font-serif text-[16px] sm:text-[18px] font-medium text-ink-2-light dark:text-ink-2-dark tabular-nums text-center">{r.number}</div>
              <input type="text" value={r.timeStart} onChange={e => setRows(rs => rs.map((x, idx) => idx === i ? { ...x, timeStart: e.target.value } : x))}
                placeholder="8:10" inputMode="numeric" className="flex-1 min-w-0 bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-2 py-2 text-[14px] tabular-nums text-center focus:outline-none focus:border-ink-light dark:focus:border-ink-dark" />
              <div className="text-ink-3-light dark:text-ink-3-dark shrink-0 text-[13px]">-</div>
              <input type="text" value={r.timeEnd} onChange={e => setRows(rs => rs.map((x, idx) => idx === i ? { ...x, timeEnd: e.target.value } : x))}
                placeholder="8:50" inputMode="numeric" className="flex-1 min-w-0 bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-2 py-2 text-[14px] tabular-nums text-center focus:outline-none focus:border-ink-light dark:focus:border-ink-dark" />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button onClick={applyDefaults} disabled={busy} className="col-span-2 sm:col-span-1 py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13px] font-semibold disabled:opacity-50">По умолчанию</button>
          <button onClick={onClose} className="py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13px] font-semibold">Отмена</button>
          <button onClick={save} disabled={busy} className="py-2.5 rounded-xl bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark text-[13px] font-semibold disabled:opacity-50">{busy ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      </div>
    </div>
  );
}
