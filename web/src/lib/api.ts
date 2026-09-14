import type { School, Teacher, Week } from './types';

const BASE = (import.meta.env.VITE_API_BASE ?? '') + '/api';

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + url, init);
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return (await res.json()) as T;
}

export const api = {
  health: () => json<{ ok: boolean }>('/health'),
  school: () => json<School>('/school'),
  classes: () => json<{ classes: string[] }>('/classes'),
  teachers: () => json<{ teachers: Teacher[] }>('/teachers'),
  week: (className: string, dateIso?: string) =>
    json<Week>(`/week/${encodeURIComponent(className)}${dateIso ? `?date=${dateIso}` : ''}`),
  weekTeacher: (teacherId: number, dateIso?: string) =>
    json<Week>(`/week-teacher/${teacherId}${dateIso ? `?date=${dateIso}` : ''}`),
};
