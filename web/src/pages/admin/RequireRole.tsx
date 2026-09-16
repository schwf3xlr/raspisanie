import { Link, useOutletContext } from 'react-router-dom';
import type { AdminRole } from '../../lib/admin-api';

interface Ctx { role: AdminRole | null }

// Оборачивает страницу в панели: если у текущего админа нет одной из указанных ролей -
// показывает страницу «Нет доступа» вместо контента.
export default function RequireRole({ allow, children }: { allow: AdminRole[]; children: React.ReactNode }) {
  const { role } = useOutletContext<Ctx>();

  if (role && allow.includes(role)) return <>{children}</>;

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="max-w-md text-center">
        <div className="w-14 h-14 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400 grid place-items-center mx-auto mb-5">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="10" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
        </div>
        <h1 className="font-serif text-[28px] -tracking-[.02em] mb-3 font-normal">Нет доступа</h1>
        <p className="text-ink-2-light dark:text-ink-2-dark text-[14.5px] leading-relaxed mb-1">
          Эта страница доступна только техническому администратору.
        </p>
        <p className="text-ink-3-light dark:text-ink-3-dark text-[13px] leading-relaxed mb-6">
          Ваша роль: <b className="text-ink-2-light dark:text-ink-2-dark">{roleLabel(role)}</b>.
          Обратитесь к техническому администратору школы, если Вам нужны расширенные права.
        </p>
        <div className="flex gap-2 justify-center">
          <Link to="/admin" className="px-4 py-2.5 rounded-full bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[14px]">
            На дашборд
          </Link>
          <Link to="/app" className="px-4 py-2.5 rounded-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark font-semibold text-[14px]">
            К расписанию
          </Link>
        </div>
      </div>
    </div>
  );
}

function roleLabel(role: AdminRole | null): string {
  if (role === 'tech') return 'Технический администратор';
  if (role === 'school') return 'Администратор школы';
  return '-';
}
