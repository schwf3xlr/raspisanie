import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type PublicChangelogEntry } from '../lib/api';
import SchoolLogo from '../components/SchoolLogo';

export default function ChangelogPage() {
  const [entries, setEntries] = useState<PublicChangelogEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.changelog()
      .then(r => setEntries(r.entries))
      .catch(err => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark">
      <header className="max-w-3xl mx-auto px-6 pt-8 pb-6 flex items-center gap-3">
        <Link to="/" className="flex items-center gap-3 group">
          <SchoolLogo size={28} className="rounded-lg" />
          <span className="text-[14px] font-semibold text-ink-2-light dark:text-ink-2-dark group-hover:text-ink-light dark:group-hover:text-ink-dark">
            Расписание СОШ №44
          </span>
        </Link>
      </header>

      <main className="max-w-3xl mx-auto px-6 pb-24">
        <h1 className="font-serif text-[38px] sm:text-[48px] -tracking-[.02em] leading-tight mb-2">
          История обновлений
        </h1>
        <p className="text-ink-3-light dark:text-ink-3-dark text-[13.5px] mb-10">
          Что менялось в приложении и на сайте.
        </p>

        {error && (
          <div className="mb-6 bg-red-50 dark:bg-red-950/40 border border-red-300/60 dark:border-red-900/60 text-red-700 dark:text-red-400 rounded-xl px-3 py-2.5 text-[13.5px]">
            {error}
          </div>
        )}
        {entries == null && !error && (
          <div className="text-ink-2-light dark:text-ink-2-dark text-[14px]">Загружаем…</div>
        )}
        {entries && entries.length === 0 && (
          <div className="text-ink-3-light dark:text-ink-3-dark text-[14px]">
            История пока пуста - здесь появятся записи о новых версиях.
          </div>
        )}

        {entries && entries.length > 0 && (
          <ol className="space-y-6">
            {entries.map(e => (
              <li key={e.versionCode} className="border border-line-light dark:border-line-dark rounded-2xl p-5 md:p-6">
                <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
                  <div className="flex items-center gap-2">
                    <div className="font-serif text-[22px] md:text-[26px] -tracking-[.01em] font-medium tabular-nums">
                      {e.versionName}
                    </div>
                    {e.mandatory && (
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-bold tracking-[.06em] uppercase text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-950/60 px-2 py-0.5 rounded-full">
                        Критическое
                      </span>
                    )}
                  </div>
                  <div className="text-[12.5px] text-ink-3-light dark:text-ink-3-dark tabular-nums">
                    {new Date(e.publishedAt).toLocaleDateString('ru', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>
                {e.changelog ? (
                  <div className="text-[14.5px] text-ink-2-light dark:text-ink-2-dark leading-relaxed whitespace-pre-line">
                    {e.changelog}
                  </div>
                ) : (
                  <div className="text-[13px] text-ink-3-light dark:text-ink-3-dark italic">
                    Описание не приложено.
                  </div>
                )}
              </li>
            ))}
          </ol>
        )}

        <div className="mt-12 pt-6 border-t border-line-light dark:border-line-dark flex justify-between items-center text-[13px] text-ink-3-light dark:text-ink-3-dark flex-wrap gap-3">
          <Link to="/" className="hover:text-ink-light dark:hover:text-ink-dark font-semibold">
            ← На главную
          </Link>
          <a href="mailto:schwf3xlr@mail.ru" className="hover:text-ink-light dark:hover:text-ink-dark">
            schwf3xlr@mail.ru
          </a>
        </div>
      </main>
    </div>
  );
}
