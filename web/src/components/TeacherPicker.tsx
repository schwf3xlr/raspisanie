import { useMemo, useState } from 'react';
import type { Teacher } from '../lib/types';

interface Props {
  teachers: Teacher[];
  onPick: (teacher: Teacher) => void;
  onSwitchToClass: () => void;
}

export default function TeacherPicker({ teachers, onPick, onSwitchToClass }: Props) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return teachers;
    return teachers.filter(t =>
      t.shortName.toLowerCase().includes(q) || t.fullName.toLowerCase().includes(q)
    );
  }, [teachers, query]);

  return (
    <div className="max-w-2xl mx-auto px-6 pb-10">
      <div className="pt-12 md:pt-20 pb-6 md:pb-8">
        <div className="w-14 h-14 rounded-2xl bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark grid place-items-center font-serif font-medium text-[26px] mb-6">
          У
        </div>
        <h1 className="font-serif text-[40px] -tracking-[.02em] leading-[1.05] mb-3">
          Выбери <em className="italic text-accent dark:text-accent-dark">себя</em> из списка
        </h1>
        <p className="text-ink-2-light dark:text-ink-2-dark text-[15px] leading-relaxed mb-6">
          Мы запомним выбор — при следующем открытии сразу покажем твоё расписание.
        </p>

        <div className="flex items-center gap-2 mb-4">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Поиск по фамилии…"
            className="flex-1 bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark"
          />
          <button
            onClick={onSwitchToClass}
            className="shrink-0 px-4 py-3 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13px] font-semibold text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark"
          >
            Я ученик
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-ink-3-light dark:text-ink-3-dark">
          <div className="font-serif text-[22px] text-ink-2-light dark:text-ink-2-dark mb-1.5">Никого не найдено</div>
          Попробуй по-другому написать фамилию
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(t => (
            <button
              key={t.id}
              onClick={() => onPick(t)}
              className="w-full flex items-center gap-3 p-4 rounded-2xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-left hover:border-accent hover:bg-accent-soft dark:hover:bg-accent-soft-dark active:scale-[.99] transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark grid place-items-center font-serif font-medium text-[16px] text-ink-light dark:text-ink-dark shrink-0">
                {t.shortName.slice(0, 1)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-[15px] text-ink-light dark:text-ink-dark truncate">{t.shortName}</div>
                <div className="text-[12.5px] text-ink-3-light dark:text-ink-3-dark truncate">{t.fullName}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
