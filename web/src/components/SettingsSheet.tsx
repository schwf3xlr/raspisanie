import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import type { ThemeMode } from '../lib/hooks';
import type { SavedViewer } from '../lib/types';
import { useAppVersion } from '../lib/version';
import { checkForUpdate } from '../lib/update-check';

interface Props {
  open: boolean;
  onClose: () => void;
  viewer: SavedViewer;
  onChangeViewer: () => void;
  theme: ThemeMode;
  onChangeTheme: (m: ThemeMode) => void;
}

export default function SettingsSheet({ open, onClose, viewer, onChangeViewer, theme, onChangeTheme }: Props) {
  const version = useAppVersion();
  const isNative = Capacitor.isNativePlatform();
  const [checking, setChecking] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  if (!open) return null;

  const isTeacher = viewer.mode === 'teacher';
  const label = isTeacher ? 'Я учитель' : 'Мой класс';
  const value = isTeacher ? (viewer.teacherName ?? 'учитель не выбран') : (viewer.className ?? 'не выбран');
  const switchText = isTeacher ? 'Выбрать другого' : 'Сменить класс';

  const onCheckUpdate = async () => {
    setChecking(true);
    setUpdateMsg(null);
    try {
      const r = await checkForUpdate({ silent: false });
      if (r.status === 'up-to-date') {
        setUpdateMsg('У Вас установлена последняя версия.');
      } else if (r.status === 'error') {
        setUpdateMsg('Не удалось проверить обновления. Попробуйте позже.');
      }
      // 'offered' - диалог показан, ничего дополнительно писать не нужно.
    } catch {
      setUpdateMsg('Не удалось проверить обновления.');
    } finally {
      setChecking(false);
      if (updateMsg == null) {
        setTimeout(() => setUpdateMsg(null), 4000);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end md:items-center justify-center z-20 md:p-6"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-bg-light dark:bg-bg-dark w-full max-w-md rounded-t-3xl md:rounded-3xl px-6 pt-6 pb-8 animate-[slideup_.25s_ease-out]">
        <h3 className="font-serif font-medium text-[22px] -tracking-[.01em] mb-1">Настройки</h3>

        <div className="flex justify-between items-center py-4 pt-5">
          <div className="min-w-0">
            <div className="text-[14.5px]">{label}</div>
            <div className="text-ink-3-light dark:text-ink-3-dark text-[12.5px] mt-0.5 truncate">{value}</div>
          </div>
          <button onClick={onChangeViewer} className="text-accent dark:text-accent-dark font-semibold shrink-0 ml-3">
            {switchText}
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

        {isNative && (
          <div className="flex justify-between items-center py-4 border-t border-line-light dark:border-line-dark">
            <div className="min-w-0">
              <div className="text-[14.5px]">Обновление приложения</div>
              <div className="text-ink-3-light dark:text-ink-3-dark text-[12.5px] mt-0.5 truncate">
                {updateMsg ?? 'Проверить наличие новой версии'}
              </div>
            </div>
            <button
              onClick={onCheckUpdate}
              disabled={checking}
              className="text-accent dark:text-accent-dark font-semibold shrink-0 ml-3 disabled:opacity-50"
            >
              {checking ? 'Проверяю…' : 'Проверить'}
            </button>
          </div>
        )}

        <div className="pt-4 border-t border-line-light dark:border-line-dark mt-0 flex flex-col gap-2 text-[12.5px] text-ink-3-light dark:text-ink-3-dark">
          <Link to="/changelog" onClick={onClose} className="hover:text-ink-light dark:hover:text-ink-dark">
            История обновлений
          </Link>
          <Link to="/privacy" onClick={onClose} className="hover:text-ink-light dark:hover:text-ink-dark">
            Политика конфиденциальности
          </Link>
          <Link to="/terms" onClick={onClose} className="hover:text-ink-light dark:hover:text-ink-dark">
            Пользовательское соглашение
          </Link>
          <a href="mailto:schwf3xlr@mail.ru" className="hover:text-ink-light dark:hover:text-ink-dark">
            schwf3xlr@mail.ru
          </a>
        </div>

        <Link
          to="/admin/login"
          onClick={onClose}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark py-3 rounded-2xl font-semibold text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><rect x="3" y="11" width="18" height="10" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          Панель управления
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
