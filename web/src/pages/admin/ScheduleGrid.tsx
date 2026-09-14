import { forwardRef, useEffect } from 'react';
import type { AdminGroup, AdminDictionaries } from '../../lib/admin-api';

export interface GridCellData {
  fromOverride?: boolean;
  isCancelled?: boolean;
  isDistant?: boolean;
  isConflict?: boolean;
  groups: AdminGroup[];
}

export type ClickModifiers = { shift: boolean; ctrl: boolean };

interface GridProps {
  classes: string[];
  numbers: number[];
  timeFor: (n: number) => { timeStart: string; timeEnd: string };
  dataFor: (className: string, number: number) => GridCellData | null;
  selection: Set<string>;
  anchor: { className: string; number: number } | null;
  onCellClick: (className: string, number: number, mods: ClickModifiers) => void;
  onClickClass?: (className: string) => void;
  onClickNumber?: (n: number) => void;
  dicts: AdminDictionaries | null;
  tint?: 'template' | 'week';
}

const NUM_W = 44;
const TIME_W = 76;
const CELL_MIN_H = 64;

function subjNameOf(dicts: AdminDictionaries | null, id: number): string {
  return dicts?.subjects.find(s => s.id === id)?.name ?? '';
}
function teacherNameOf(dicts: AdminDictionaries | null, id: number | null): string {
  if (id == null) return '';
  return dicts?.teachers.find(t => t.id === id)?.shortName ?? '';
}
function roomNameOf(dicts: AdminDictionaries | null, id: number | null): string {
  if (id == null) return '';
  return dicts?.rooms.find(r => r.id === id)?.name ?? '';
}

export default function ScheduleGrid({
  classes, numbers, timeFor, dataFor, selection, anchor, onCellClick,
  onClickClass, onClickNumber, dicts, tint,
}: GridProps) {
  const bg = tint === 'template'
    ? 'bg-[#faf6ee] dark:bg-[#141210]'
    : 'bg-bg-light dark:bg-bg-dark';

  const totalLeft = NUM_W + TIME_W;

  // Когда пользователь выбирает ячейку и справа открывается drawer, сетка сужается -
  // и выбранная ячейка (особенно правая, вроде 11А) может уехать за пределы видимости.
  // Двойной requestAnimationFrame даёт браузеру сделать reflow, потом уже скроллим.
  useEffect(() => {
    if (!anchor) return;
    const key = `${anchor.className}::${anchor.number}`;
    let selector: string;
    try { selector = `[data-cell="${CSS.escape(key)}"]`; }
    catch { selector = `[data-cell='${key.replace(/'/g, "\\'")}']`; }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const el = document.querySelector(selector);
        if (el instanceof HTMLElement) {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
        }
      });
    });
  }, [anchor?.className, anchor?.number]);

  return (
    <div className={`flex-1 overflow-auto ${bg}`}>
      <style>{`
        @keyframes conflictPulse {
          0%, 100% { background: rgba(239, 68, 68, 0.08); box-shadow: inset 0 0 0 2px rgba(239, 68, 68, 0.55); }
          50%      { background: rgba(239, 68, 68, 0.22); box-shadow: inset 0 0 0 2px rgba(239, 68, 68, 1); }
        }
        [data-conflict="true"] { animation: conflictPulse 1.1s ease-in-out infinite; }
        .sched-table { border-collapse: separate; border-spacing: 0; }
        .sched-table th, .sched-table td { box-sizing: border-box; }
      `}</style>
      <table className="sched-table min-w-full">
        <thead className={`sticky top-0 z-20 ${bg}`}>
          <tr>
            <th
              style={{ width: totalLeft, minWidth: totalLeft }}
              className={`sticky left-0 z-30 ${bg} p-0 border-b border-r border-line-light dark:border-line-dark`}
            >
              <div className="flex items-stretch" style={{ height: 46 }}>
                <div
                  style={{ width: NUM_W }}
                  className="flex items-end justify-center pb-2 text-[10.5px] font-bold tracking-[.08em] uppercase text-ink-3-light dark:text-ink-3-dark border-r border-line-light dark:border-line-dark"
                >
                  №
                </div>
                <div className="flex-1 flex items-end justify-center pb-2 text-[10.5px] font-bold tracking-[.08em] uppercase text-ink-3-light dark:text-ink-3-dark">
                  Время
                </div>
              </div>
            </th>
            {classes.map(cls => (
              <th
                key={cls}
                className={`min-w-[160px] p-0 border-b border-r border-line-light dark:border-line-dark ${bg}`}
                style={{ height: 46 }}
              >
                {onClickClass ? (
                  <button
                    onClick={() => onClickClass(cls)}
                    className="w-full h-full font-serif text-[20px] font-medium leading-none tabular-nums hover:bg-panel-light dark:hover:bg-panel-dark transition-colors"
                  >
                    {cls}
                  </button>
                ) : (
                  <div className="w-full h-full grid place-items-center font-serif text-[20px] font-medium leading-none tabular-nums">
                    {cls}
                  </div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {numbers.map(n => {
            const t = timeFor(n);
            return (
              <tr key={n}>
                <td
                  style={{ width: totalLeft, minWidth: totalLeft, height: CELL_MIN_H }}
                  className={`sticky left-0 z-10 ${bg} p-0 border-b border-r border-line-light dark:border-line-dark`}
                >
                  <div className="flex items-stretch h-full">
                    <div
                      style={{ width: NUM_W }}
                      className="flex items-center justify-center border-r border-line-light dark:border-line-dark"
                    >
                      {onClickNumber ? (
                        <button onClick={() => onClickNumber(n)} className="font-serif text-[24px] font-medium leading-none tabular-nums hover:text-accent dark:hover:text-accent-dark transition-colors">
                          {n}
                        </button>
                      ) : (
                        <div className="font-serif text-[24px] font-medium leading-none tabular-nums">{n}</div>
                      )}
                    </div>
                    <div className="flex-1 flex items-center justify-center text-center px-1">
                      <div className="text-[12px] text-ink-2-light dark:text-ink-2-dark tabular-nums font-medium leading-tight">
                        {t.timeStart ? (
                          <>
                            <div>{t.timeStart}</div>
                            <div className="text-ink-3-light dark:text-ink-3-dark mt-0.5">{t.timeEnd}</div>
                          </>
                        ) : <span className="italic text-ink-3-light dark:text-ink-3-dark">-</span>}
                      </div>
                    </div>
                  </div>
                </td>
                {classes.map(cls => {
                  const cell = dataFor(cls, n);
                  const key = `${cls}::${n}`;
                  const active = selection.has(key);
                  const isAnchor = anchor?.className === cls && anchor.number === n;
                  return (
                    <Cell key={cls}
                      dataKey={key}
                      cell={cell}
                      active={active}
                      isAnchor={isAnchor}
                      dicts={dicts}
                      subj={subjNameOf}
                      teacher={teacherNameOf}
                      room={roomNameOf}
                      onClick={(e) => onCellClick(cls, n, { shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey })}
                    />
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ dataKey, cell, active, isAnchor, dicts, subj, teacher, room, onClick }: {
  dataKey: string;
  cell: GridCellData | null;
  active: boolean;
  isAnchor: boolean;
  dicts: AdminDictionaries | null;
  subj: (d: AdminDictionaries | null, id: number) => string;
  teacher: (d: AdminDictionaries | null, id: number | null) => string;
  room: (d: AdminDictionaries | null, id: number | null) => string;
  onClick: (e: React.MouseEvent) => void;
}) {
  const empty = !cell || cell.groups.length === 0;
  const cancelled = cell?.isCancelled;
  const distant = cell?.isDistant;
  const changed = cell?.fromOverride;
  const conflict = cell?.isConflict;
  const singleGroup = cell?.groups.length === 1;

  const ringCls = isAnchor
    ? 'ring-2 ring-accent dark:ring-accent-dark ring-inset relative z-[1]'
    : active
      ? 'ring-2 ring-accent/60 dark:ring-accent-dark/60 ring-inset relative z-[1]'
      : '';

  const bgCls = active || isAnchor
    ? 'bg-accent-soft dark:bg-accent-soft-dark'
    : distant
      ? 'bg-distant-soft dark:bg-distant-soft-dark'
      : changed
        ? 'bg-accent-soft/50 dark:bg-accent-soft-dark/50'
        : '';

  return (
    <td
      onClick={onClick}
      data-cell={dataKey}
      data-conflict={conflict ? 'true' : undefined}
      style={{ height: CELL_MIN_H }}
      className={[
        'min-w-[160px] p-0 border-b border-r border-line-light dark:border-line-dark cursor-pointer transition-colors group relative select-none',
        bgCls, ringCls,
        !active && !isAnchor && !conflict ? 'hover:bg-panel-light dark:hover:bg-panel-dark' : '',
      ].filter(Boolean).join(' ')}
    >
      <div className={['h-full w-full px-2 py-2 flex', singleGroup && !cancelled && !empty ? 'items-center justify-center' : 'items-start'].join(' ')}>
        {empty ? (
          <div className="opacity-0 group-hover:opacity-100 transition-opacity w-full text-center text-[13px] font-medium text-ink-3-light dark:text-ink-3-dark self-center">
            + Добавить
          </div>
        ) : cancelled ? (
          <div className="w-full text-[13px] text-ink-3-light dark:text-ink-3-dark italic text-center self-center">
            Урок отменён
          </div>
        ) : singleGroup ? (
          <SingleGroup g={cell!.groups[0]!} distant={distant} changed={changed} dicts={dicts} subj={subj} teacher={teacher} room={room} />
        ) : (
          <div className="w-full">
            {cell!.groups.map((g, i) => (
              <div key={i} className={i > 0 ? 'mt-1.5 pt-1.5 border-t border-dashed border-line-light dark:border-line-dark' : ''}>
                <div className="text-[13px] font-semibold leading-tight flex items-start gap-1">
                  <span className="min-w-0 flex-1">
                    {subj(dicts, g.subjectId) || <span className="text-ink-3-light dark:text-ink-3-dark italic font-normal">без предмета</span>}
                  </span>
                  {distant && i === 0 && <Tag color="distant">Дист</Tag>}
                  {changed && !distant && i === 0 && <Tag color="accent">Замена</Tag>}
                </div>
                <div className="text-[11.5px] text-ink-2-light dark:text-ink-2-dark leading-tight mt-0.5">
                  {teacher(dicts, g.teacherId)}
                  {room(dicts, g.roomId) && <span className="ml-1.5 font-semibold text-ink-light dark:text-ink-dark tabular-nums">{room(dicts, g.roomId)}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </td>
  );
}

function SingleGroup({ g, distant, changed, dicts, subj, teacher, room }: {
  g: AdminGroup; distant?: boolean; changed?: boolean;
  dicts: AdminDictionaries | null;
  subj: (d: AdminDictionaries | null, id: number) => string;
  teacher: (d: AdminDictionaries | null, id: number | null) => string;
  room: (d: AdminDictionaries | null, id: number | null) => string;
}) {
  return (
    <div className="w-full flex flex-col items-center justify-center text-center">
      <div className="text-[13px] font-semibold leading-tight flex items-center gap-1">
        <span>{subj(dicts, g.subjectId) || <span className="text-ink-3-light dark:text-ink-3-dark italic font-normal">без предмета</span>}</span>
        {distant && <Tag color="distant">Дист</Tag>}
        {changed && !distant && <Tag color="accent">Замена</Tag>}
      </div>
      <div className="text-[11.5px] text-ink-2-light dark:text-ink-2-dark leading-tight mt-0.5">
        {teacher(dicts, g.teacherId)}
        {room(dicts, g.roomId) && <span className="ml-1.5 font-semibold text-ink-light dark:text-ink-dark tabular-nums">{room(dicts, g.roomId)}</span>}
      </div>
    </div>
  );
}

function Tag({ color, children }: { color: 'distant' | 'accent'; children: React.ReactNode }) {
  const cls = color === 'distant'
    ? 'text-distant dark:text-distant-dark bg-distant/10 dark:bg-distant-dark/20'
    : 'text-accent dark:text-accent-dark bg-accent/10 dark:bg-accent-dark/20';
  return <span className={`shrink-0 text-[9px] font-bold uppercase tracking-wider px-1 py-0.5 rounded ${cls}`}>{children}</span>;
}

interface DictSelectProps {
  value: number | null;
  options: Array<{ id: number; label: string }>;
  onChange: (id: number | null) => void;
  placeholder: string;
  allowEmpty?: boolean;
}
export const DictSelect = forwardRef<HTMLInputElement, DictSelectProps>(function DictSelect(
  { value, options, onChange, placeholder, allowEmpty }, ref
) {
  const current = value != null ? options.find(o => o.id === value)?.label ?? '' : '';
  return (
    <div className="relative">
      <input
        ref={ref}
        type="text"
        defaultValue={current}
        key={current}
        placeholder={placeholder}
        list={placeholder + '-list'}
        onChange={e => {
          const v = e.target.value.trim();
          if (!v) { if (allowEmpty) onChange(null); return; }
          const found = options.find(o => o.label.toLowerCase() === v.toLowerCase());
          if (found) onChange(found.id);
        }}
        className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2.5 text-[14px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark"
      />
      <datalist id={placeholder + '-list'}>
        {options.map(o => <option key={o.id} value={o.label} />)}
      </datalist>
    </div>
  );
});
