import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { adminApi, type AdminRole } from '../../lib/admin-api';
import SchoolLogo from '../../components/SchoolLogo';
import { useAppVersion } from '../../lib/version';

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [checked, setChecked] = useState(false);
  const [role, setRole] = useState<AdminRole | null>(null);
  const [me, setMe] = useState<{ login?: string; displayName?: string | null } | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const version = useAppVersion();

  useEffect(() => {
    adminApi.me()
      .then(r => {
        if (r.authenticated) {
          setChecked(true);
          setRole(r.role ?? null);
          setMe({ login: r.login, displayName: r.displayName });
        } else {
          navigate('/admin/login', { replace: true });
        }
      })
      .catch(() => navigate('/admin/login', { replace: true }));
  }, [navigate]);

  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const logout = async () => {
    await adminApi.logout().catch(() => {});
    navigate('/admin/login', { replace: true });
  };

  if (!checked) {
    return (
      <div className="min-h-screen grid place-items-center">
        <div className="w-8 h-8 border-[3px] border-line-light dark:border-line-dark border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  const nav = (
    <>
      <nav className="flex flex-col gap-0.5">
        <NavItem to="/admin" end icon="grid" label="Дашборд" />
        <NavItem to="/admin/schedule" icon="calendar" label="Расписание" />
      </nav>
      <div className="mt-6 mb-2 px-3 text-[10.5px] font-bold tracking-[.12em] uppercase text-ink-3-light dark:text-ink-3-dark">
        Настройки
      </div>
      <nav className="flex flex-col gap-0.5">
        <NavItem to="/admin/template" icon="template" label="Стандартное расписание" />
        <NavItem to="/admin/dictionaries" icon="book" label="Справочники" />
      </nav>
      {role === 'tech' && (
        <>
          <div className="mt-6 mb-2 px-3 text-[10.5px] font-bold tracking-[.12em] uppercase text-ink-3-light dark:text-ink-3-dark">
            Технический администратор
          </div>
          <nav className="flex flex-col gap-0.5">
            <NavItem to="/admin/users" icon="users" label="Администраторы" />
          </nav>
        </>
      )}
    </>
  );

  const bottomActions = (
    <div className="pt-6 border-t border-line-light dark:border-line-dark space-y-1">
      {me && (
        <div className="px-3 pb-2 text-[12px] text-ink-3-light dark:text-ink-3-dark">
          <div className="font-semibold text-ink-2-light dark:text-ink-2-dark truncate">
            {me.displayName || me.login}
          </div>
          <div className="text-[11px] mt-0.5">
            {role === 'tech' ? 'Технический администратор' : 'Администратор школы'}
          </div>
        </div>
      )}
      <Link to="/app" className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] text-ink-2-light dark:text-ink-2-dark hover:bg-panel-light dark:hover:bg-panel-dark hover:text-ink-light dark:hover:text-ink-dark transition-colors">
        <IconExternal /> Как видит ученик
      </Link>
      <button onClick={logout} className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] text-ink-2-light dark:text-ink-2-dark hover:bg-panel-light dark:hover:bg-panel-dark hover:text-ink-light dark:hover:text-ink-dark transition-colors w-full text-left">
        <IconLogout /> Выйти
      </button>
      {version && (
        <div className="mt-3 px-3 text-[11px] text-ink-3-light dark:text-ink-3-dark tabular-nums">
          {version.label}
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark md:flex">
      {/* Mobile top bar */}
      <header className="md:hidden sticky top-0 z-30 bg-bg-light/95 dark:bg-bg-dark/95 backdrop-blur-md border-b border-line-light dark:border-line-dark px-4 h-14 flex items-center justify-between">
        <Link to="/admin" className="flex items-center gap-2.5">
          <SchoolLogo size={32} />
          <div className="leading-[1.15]">
            <div className="font-semibold text-[13px]">СОШ №44</div>
            <div className="text-ink-3-light dark:text-ink-3-dark text-[11px]">Админ</div>
          </div>
        </Link>
        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Меню"
          className="w-10 h-10 -mr-2 rounded-xl grid place-items-center text-ink-2-light dark:text-ink-2-dark hover:bg-panel-light dark:hover:bg-panel-dark"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16"/></svg>
        </button>
      </header>

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/40" onClick={e => { if (e.target === e.currentTarget) setDrawerOpen(false); }}>
          <aside className="absolute right-0 top-0 bottom-0 w-72 bg-bg-light dark:bg-bg-dark border-l border-line-light dark:border-line-dark px-5 py-6 flex flex-col overflow-y-auto animate-[slideInRight_.2s_ease-out]">
            <div className="flex justify-between items-center mb-8">
              <div className="font-semibold text-[14px]">Меню</div>
              <button onClick={() => setDrawerOpen(false)} className="w-9 h-9 -mr-2 rounded-xl grid place-items-center text-ink-2-light dark:text-ink-2-dark">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M6 18L18 6"/></svg>
              </button>
            </div>
            {nav}
            <div className="mt-auto">{bottomActions}</div>
          </aside>
          <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 border-r border-line-light dark:border-line-dark px-5 py-6 flex-col">
        <Link to="/" className="flex items-center gap-3 mb-8">
          <SchoolLogo size={36} />
          <div className="leading-[1.15]">
            <div className="font-semibold text-[14px]">СОШ №44</div>
            <div className="text-ink-3-light dark:text-ink-3-dark text-[11.5px]">Панель управления</div>
          </div>
        </Link>
        {nav}
        <div className="mt-auto">{bottomActions}</div>
      </aside>

      <main className="flex-1 min-w-0 md:overflow-x-auto">
        <Outlet />
      </main>
    </div>
  );
}

function NavItem({ to, end, icon, label }: { to: string; end?: boolean; icon: 'grid' | 'calendar' | 'template' | 'book' | 'users'; label: string }) {
  return (
    <NavLink to={to} end={end}
      className={({ isActive }) => [
        'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] font-medium transition-colors',
        isActive
          ? 'bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark'
          : 'text-ink-2-light dark:text-ink-2-dark hover:bg-panel-light dark:hover:bg-panel-dark hover:text-ink-light dark:hover:text-ink-dark',
      ].join(' ')}
    >
      <span className="w-4 h-4 grid place-items-center [&>svg]:w-4 [&>svg]:h-4">
        {icon === 'grid' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>}
        {icon === 'calendar' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>}
        {icon === 'template' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>}
        {icon === 'book' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M4 4h11a4 4 0 014 4v13H7a3 3 0 01-3-3V4z"/><path d="M4 18a3 3 0 013-3h12"/></svg>}
        {icon === 'users' && <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>}
      </span>
      {label}
    </NavLink>
  );
}
function IconExternal() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M15 3h6v6M10 14L21 3M21 14v5a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h5"/></svg>; }
function IconLogout() { return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>; }
