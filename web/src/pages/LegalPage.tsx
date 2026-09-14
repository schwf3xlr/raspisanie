import { Link } from 'react-router-dom';
import SchoolLogo from '../components/SchoolLogo';

interface Props {
  title: string;
  updatedAt: string;
  children: React.ReactNode;
}

export default function LegalPage({ title, updatedAt, children }: Props) {
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
          {title}
        </h1>
        <p className="text-ink-3-light dark:text-ink-3-dark text-[13.5px] mb-10">
          Актуально на {updatedAt}
        </p>

        <div className="legal-content space-y-5 text-[15px] leading-[1.7] text-ink-2-light dark:text-ink-2-dark">
          {children}
        </div>

        <div className="mt-12 pt-6 border-t border-line-light dark:border-line-dark flex justify-between items-center text-[13px] text-ink-3-light dark:text-ink-3-dark flex-wrap gap-3">
          <Link to="/" className="hover:text-ink-light dark:hover:text-ink-dark font-semibold">
            ← На главную
          </Link>
          <a href="mailto:schwf3xlr@mail.ru" className="hover:text-ink-light dark:hover:text-ink-dark">
            schwf3xlr@mail.ru
          </a>
        </div>
      </main>

      <style>{`
        .legal-content h2 { font-family: 'GT Sectra', 'Playfair Display', ui-serif, serif; font-size: 22px; letter-spacing: -.005em; margin-top: 32px; margin-bottom: 8px; color: var(--ink); }
        html.dark .legal-content h2 { color: var(--ink-dark, #f4f4f0); }
        .legal-content ul { list-style: disc; padding-left: 22px; }
        .legal-content ul li { margin: 4px 0; }
        .legal-content a { color: inherit; text-decoration: underline; text-underline-offset: 3px; }
      `}</style>
    </div>
  );
}
