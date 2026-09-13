import { Link } from 'react-router-dom';
import type { ThemeMode } from '../lib/hooks';
import { useAppVersion } from '../lib/version';

interface Props {
  open: boolean;
  onClose: () => void;
  className: string;
  onChangeClass: () => void;
  theme: ThemeMode;
  onChangeTheme: (m: ThemeMode) => void;
}

export default function SettingsSheet({ open, onClose, className, onChangeClass, theme, onChangeTheme }: Props) {
  const version = useAppVersion();
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-20 md:p-6"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-bg-light dark:bg-bg-dark w-full max-w-md rounded-t-3xl md:rounded-3xl px-6 pt-6 pb-8 animate-[slideup_.25s_ease-out]">
        <h3 className="font-serif font-medium text-[22px] -tracking-[.01em] mb-1">Настройки</h3>

        <div className="flex justify-between items-center py-4 pt-5">
          <div>
            <div className="text-[14.5px]">Мой класс</div>
            <div className="text-ink-3-light dark:text-ink-3-dark text-[12.5px] mt-0.5">{className}</div>
          </div>
          <button onClick={onChangeClass} className="text-accent dark:text-accent-dark font-semibold">
            Сменить
          </button>
        </div>

        <div className="flex justify-between items-center py-4 border-t border-line-light dark:border-line-dark">
          <div>
            <div className="text-[14.5px]">Тема</div>
            <div className="text-ink-3-light dark:text-ink-3-dark text-[12.5px] mt-0.5">Как приложение выглядит</div>
          </div>
          <div className="flex bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-full p-0.5">
            {(['light', 'dark', 'system'] as ThemeMode[]).map(m => (
              <button
                key={m}
                onClick={() => onChangeTheme(m)}
                className={[
                  'px-3 py-1.5 rounded-full text-[12.5px] font-semibold',
                  theme === m
                    ? 'bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark'
                    : 'text-ink-3-light dark:text-ink-3-dark',
                ].join(' ')}
              >
                {m === 'light' ? 'Светлая' : m === 'dark' ? 'Тёмная' : 'Авто'}
              </button>
            ))}
          </div>
        </div>

        <Link
          to="/admin/login"
          onClick={onClose}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark py-3 rounded-2xl font-semibold text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          Админ-панель
        </Link>

        <button
          onClick={onClose}
          className="mt-2 w-full bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark py-3 rounded-2xl font-semibold"
        >
          Закрыть
        </button>

        {version && (
          <div className="mt-4 text-center text-[11.5px] text-ink-3-light dark:text-ink-3-dark font-medium tabular-nums">
            Расписание СОШ №44 · {version.label}
          </div>
        )}
      </div>
      <style>{`@keyframes slideup { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}
