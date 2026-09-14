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
