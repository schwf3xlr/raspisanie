import type { DayAllResponse, School, Teacher, Week } from './types';

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
  dayAll: (dateIso?: string) =>
    json<DayAllResponse>(`/day-all${dateIso ? `?date=${dateIso}` : ''}`),

  pushRegister: (token: string, opts: { platform?: string; className?: string | null; teacherId?: number | null }) =>
    json<{ ok: boolean }>('/push/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, ...opts }),
    }),
  pushUnregister: (token: string) =>
    json<{ ok: boolean }>('/push/unregister', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    }),
};
