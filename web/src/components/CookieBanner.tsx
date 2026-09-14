import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

const KEY = 'cookie-consent-v1';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) {
        // небольшая задержка, чтобы не мигало при первой отрисовке
        const t = setTimeout(() => setVisible(true), 500);
        return () => clearTimeout(t);
      }
    } catch { /* ignore */ }
  }, []);

  const accept = () => {
    try { localStorage.setItem(KEY, String(Date.now())); } catch { /* ignore */ }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[80] pointer-events-none animate-[cookieUp_.35s_ease-out]">
      <div className="max-w-3xl mx-auto m-3 md:m-6 pointer-events-auto bg-bg-light dark:bg-bg-dark border border-line-light dark:border-line-dark rounded-2xl shadow-2xl px-4 py-4 md:px-5 md:py-4 flex flex-col md:flex-row gap-3 md:gap-4 md:items-center">
        <p className="text-[13.5px] leading-[1.55] text-ink-2-light dark:text-ink-2-dark flex-1">
          Мы используем файлы cookie и технические данные (IP, логи) для работы сайта
          и обезличенной статистики. Отключить cookie можно в настройках браузера. Подробнее -
          в <Link to="/privacy" className="text-ink-light dark:text-ink-dark font-semibold underline underline-offset-[3px]">Политике конфиденциальности</Link>.
        </p>
        <button
          onClick={accept}
          className="shrink-0 px-5 py-2.5 rounded-full bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[13.5px] hover:opacity-90"
        >
          Принять
        </button>
      </div>
      <style>{`@keyframes cookieUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }`}</style>
    </div>
  );
}
