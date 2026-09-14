interface Props {
  classes: string[];
  onPick: (className: string) => void;
  onSwitchToTeacher?: () => void;
}

function parallelOf(cls: string): '5-6' | '7-8' | '9' | '10-11' | 'other' {
  const n = parseInt(cls, 10);
  if (isNaN(n)) return 'other';
  if (n <= 6) return '5-6';
  if (n <= 8) return '7-8';
  if (n === 9) return '9';
  return '10-11';
}

type GroupKey = '5-6' | '7-8' | '9' | '10-11' | 'other';
// Явный порядок отображения групп (сверху вниз).
const GROUP_ORDER: GroupKey[] = ['5-6', '7-8', '9', '10-11', 'other'];
const GROUP_LABELS: Record<GroupKey, string> = {
  '5-6': '5-6 классы',
  '7-8': '7-8 классы',
  '9': '9 классы',
  '10-11': '10-11 классы',
  'other': 'Другие',
};

function classSortKey(name: string): number {
  const m = name.match(/^(\d{1,2})\s*([А-Яа-яA-Za-z]?)/);
  if (!m) return 9999;
  const n = parseInt(m[1]!, 10);
  const letter = (m[2] ?? '').toUpperCase();
  const letterOrder = letter ? letter.charCodeAt(0) - 'А'.charCodeAt(0) + 1 : 0;
  return n * 100 + Math.max(0, Math.min(99, letterOrder));
}

export default function ClassPicker({ classes, onPick, onSwitchToTeacher }: Props) {
  const groups: Record<GroupKey, string[]> = { '5-6': [], '7-8': [], '9': [], '10-11': [], 'other': [] };
  for (const c of classes) groups[parallelOf(c)].push(c);
  // Внутри каждой группы - в естественном порядке (5А, 5Б, 6А…), даже если API вернул иначе.
  for (const k of GROUP_ORDER) groups[k].sort((a, b) => classSortKey(a) - classSortKey(b));

  return (
    <div className="max-w-2xl mx-auto px-6 pb-10">
      <div className="pt-12 md:pt-20 pb-6 md:pb-8">
        <div className="w-14 h-14 rounded-2xl bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark grid place-items-center font-serif font-medium text-[26px] mb-6">
          Ш
        </div>
        <h1 className="font-serif text-[40px] -tracking-[.02em] leading-[1.05] mb-3">
          Выберите <em className="italic text-accent dark:text-accent-dark">Ваш</em> класс
        </h1>
        <p className="text-ink-2-light dark:text-ink-2-dark text-[15px] leading-relaxed mb-4">
          Мы запомним его - при следующем открытии сразу покажем Ваше расписание.
        </p>
        {onSwitchToTeacher && (
          <button
            onClick={onSwitchToTeacher}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark"
          >
            Я учитель →
          </button>
        )}
      </div>

      {GROUP_ORDER.map(key => {
        const items = groups[key];
        if (items.length === 0) return null;
        return (
          <div key={key} className="mt-8 first:mt-6">
            <h3 className="text-[12px] font-bold tracking-[.1em] uppercase text-ink-3-light dark:text-ink-3-dark mb-3">
              {GROUP_LABELS[key]}
            </h3>
            <div className="grid gap-2 grid-cols-[repeat(auto-fill,minmax(80px,1fr))]">
              {items.map(c => (
                <button
                  key={c}
                  onClick={() => onPick(c)}
                  className="py-4 rounded-2xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-ink-light dark:text-ink-dark font-semibold text-[16px] tabular-nums transition-all hover:bg-accent-soft hover:border-accent hover:text-accent active:scale-[.97]"
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
