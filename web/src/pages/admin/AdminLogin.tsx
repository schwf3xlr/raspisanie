import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { adminApi } from '../../lib/admin-api';

export default function AdminLogin() {
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminApi.login(login, password);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-bg-light dark:bg-bg-dark grid place-items-center px-6">
      <div className="w-full max-w-sm">
        <Link to="/" className="flex items-center gap-3 mb-10 w-fit">
          <div className="w-10 h-10 rounded-xl bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark grid place-items-center font-serif font-medium text-[18px] tabular-nums">
            44
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-[14px]">СОШ №44</div>
            <div className="text-ink-3-light dark:text-ink-3-dark text-[12px]">Расписание</div>
          </div>
        </Link>

        <h1 className="font-serif text-[34px] md:text-[40px] -tracking-[.02em] leading-[1.05] mb-2 font-normal">
          Админ-панель
        </h1>
        <p className="text-ink-2-light dark:text-ink-2-dark text-[14.5px] mb-8">
          Вход только для сотрудников школы.
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="block text-[12.5px] font-semibold text-ink-2-light dark:text-ink-2-dark mb-1.5">
              Логин
            </label>
            <input
              type="text"
              autoComplete="username"
              autoFocus
              value={login}
              onChange={e => setLogin(e.target.value)}
              className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark transition-colors"
            />
          </div>
          <div>
            <label className="block text-[12.5px] font-semibold text-ink-2-light dark:text-ink-2-dark mb-1.5">
              Пароль
            </label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-xl px-4 py-3 text-[15px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark transition-colors"
            />
          </div>

          {error && (
            <div className="text-[13.5px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl px-4 py-2.5">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !login || !password}
            className="w-full bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[15px] py-3.5 rounded-xl disabled:opacity-50 hover:opacity-90 transition-opacity"
          >
            {busy ? 'Проверяем…' : 'Войти'}
          </button>
        </form>

        <div className="mt-8 pt-6 border-t border-line-light dark:border-line-dark text-[12.5px] text-ink-3-light dark:text-ink-3-dark">
          Логин и пароль задаются в файле <code className="bg-panel-light dark:bg-panel-dark px-1.5 py-0.5 rounded text-ink-2-light dark:text-ink-2-dark">api/.env</code>.
        </div>
      </div>
    </div>
  );
}
