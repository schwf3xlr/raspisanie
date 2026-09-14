import { useCallback, useEffect, useState } from 'react';

export function useLocalStorage<T>(key: string, initial: T | (() => T)): [T, (v: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) return JSON.parse(raw) as T;
    } catch { /* fall through */ }
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });

  const set = useCallback((v: T | ((prev: T) => T)) => {
    setValue(prev => {
      const next = typeof v === 'function' ? (v as (p: T) => T)(prev) : v;
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, [key]);

  return [value, set];
}

export type ThemeMode = 'light' | 'dark' | 'system';

export function useTheme(): [ThemeMode, (m: ThemeMode) => void, boolean] {
  const [mode, setMode] = useLocalStorage<ThemeMode>('theme', 'system');
  const [isDark, setIsDark] = useState<boolean>(() => resolveDark(mode));

  useEffect(() => {
    const dark = resolveDark(mode);
    setIsDark(dark);
    document.documentElement.classList.toggle('dark', dark);

    if (mode === 'system') {
      const mq = matchMedia('(prefers-color-scheme: dark)');
      const onChange = () => {
        const d = mq.matches;
        setIsDark(d);
        document.documentElement.classList.toggle('dark', d);
      };
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    }
  }, [mode]);

  return [mode, setMode, isDark];
}

function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

export function useTick(intervalMs: number) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
}

// Тикает ровно на границе минуты (когда меняются секунды :00).
// Пере-запускается по visibilitychange и по App resume (Capacitor),
// чтобы после сна устройства UI обновлялся мгновенно, а не через ~минуту.
export function useMinuteTick() {
  const [, setTick] = useState(0);
  useEffect(() => {
    let timerId: number | null = null;

    const bump = () => setTick(t => t + 1);

    const schedule = () => {
      if (timerId != null) window.clearTimeout(timerId);
      const now = new Date();
      // ms до начала следующей минуты (+ 30 мс страховки, чтобы не сработать за долю секунды до)
      const ms = 1000 - now.getMilliseconds() + (59 - now.getSeconds()) * 1000 + 30;
      timerId = window.setTimeout(() => {
        bump();
        schedule();
      }, ms);
    };

    const onWake = () => {
      // Пришли из фона / переключились на вкладку - сразу обновим и перепланируем.
      if (document.visibilityState === 'visible') {
        bump();
        schedule();
      }
    };

    schedule();
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('focus', onWake);
    window.addEventListener('pageshow', onWake);

    // Capacitor App resume - в приложении на Android после снятия с блокировки.
    let removeAppListener: (() => void) | null = null;
    void (async () => {
      try {
        const mod = await import('@capacitor/app');
        const handle = await mod.App.addListener('resume', onWake);
        removeAppListener = () => { void handle.remove(); };
      } catch {
        /* пакета нет или мы в браузере - ок */
      }
    })();

    return () => {
      if (timerId != null) window.clearTimeout(timerId);
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('focus', onWake);
      window.removeEventListener('pageshow', onWake);
      if (removeAppListener) removeAppListener();
    };
  }, []);
}
