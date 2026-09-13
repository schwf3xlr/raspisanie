const BASE = (import.meta.env.VITE_API_BASE ?? '') + '/api/admin';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body != null && init.body !== '';
  const headers: Record<string, string> = { ...(init?.headers as Record<string, string> ?? {}) };
  if (hasBody && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + url, {
    ...init,
    credentials: 'include',
    headers,
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch { /* ignore */ }
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

export interface AdminClass { id: number; name: string; sortKey: number; createdAt: string }
export interface AdminTeacher { id: number; fullName: string; shortName: string; createdAt: string }
export interface AdminSubject { id: number; name: string; createdAt: string }
export interface AdminRoom { id: number; name: string; kind: string; createdAt: string }

export interface AdminGroup {
  subjectId: number;
  teacherId: number | null;
  roomId: number | null;
}

export interface AdminTemplateLesson {
  id: number;
  className: string;
  number: number;
  timeStart: string;
  timeEnd: string;
  groups: AdminGroup[];
}

export interface AdminOverride {
  id: number;
  className: string;
  number: number;
  timeStart: string;
  timeEnd: string;
  groups: AdminGroup[];
  isCancelled: boolean;
}

export interface AdminDistant {
  id: number;
  className: string;
  lessonNumber: number | null;
  note: string | null;
}

export interface AdminDayResponse {
  date: string;
  day: string;
  published: boolean;
  publishedAt: string | null;
  classes: string[];
  timeSlots: Array<{ number: number; timeStart: string; timeEnd: string }>;
  template: AdminTemplateLesson[];
  overrides: AdminOverride[];
  distant: AdminDistant[];
}

export interface AdminTemplateResponse {
  day: string;
  classes: string[];
  timeSlots: Array<{ number: number; timeStart: string; timeEnd: string }>;
  lessons: AdminTemplateLesson[];
}

export interface AdminDictionaries {
  teachers: AdminTeacher[];
  subjects: AdminSubject[];
  rooms: AdminRoom[];
  classes: AdminClass[];
}

export interface AdminStats {
  classes: number;
  templateLessons: number;
  overrides: number;
  distant: number;
  published: number;
  teachers: number;
  subjects: number;
  rooms: number;
}

export const adminApi = {
  login: (login: string, password: string) =>
    req<{ ok: true }>('/login', { method: 'POST', body: JSON.stringify({ login, password }) }),
  logout: () => req<{ ok: true }>('/logout', { method: 'POST' }),
  me: () => req<{ authenticated: boolean }>('/me'),

  stats: () => req<AdminStats>('/stats'),

  dictionaries: () => req<AdminDictionaries>('/dictionaries'),

  // teachers
  createTeacher: (fullName: string, shortName: string) =>
    req<AdminTeacher>('/teacher', { method: 'POST', body: JSON.stringify({ fullName, shortName }) }),
  updateTeacher: (id: number, fullName: string, shortName: string) =>
    req<AdminTeacher>(`/teacher/${id}`, { method: 'PUT', body: JSON.stringify({ fullName, shortName }) }),
  deleteTeacher: (id: number) => req<{ ok: true }>(`/teacher/${id}`, { method: 'DELETE' }),

  // subjects
  createSubject: (name: string) =>
    req<AdminSubject>('/subject', { method: 'POST', body: JSON.stringify({ name }) }),
  updateSubject: (id: number, name: string) =>
    req<AdminSubject>(`/subject/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteSubject: (id: number) => req<{ ok: true }>(`/subject/${id}`, { method: 'DELETE' }),

  // rooms
  createRoom: (name: string, kind: string) =>
    req<AdminRoom>('/room', { method: 'POST', body: JSON.stringify({ name, kind }) }),
  updateRoom: (id: number, name: string, kind: string) =>
    req<AdminRoom>(`/room/${id}`, { method: 'PUT', body: JSON.stringify({ name, kind }) }),
  deleteRoom: (id: number) => req<{ ok: true }>(`/room/${id}`, { method: 'DELETE' }),

  // classes
  createClass: (name: string) =>
    req<AdminClass>('/class', { method: 'POST', body: JSON.stringify({ name }) }),
  updateClass: (id: number, name: string) =>
    req<AdminClass>(`/class/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteClass: (id: number) => req<{ ok: true }>(`/class/${id}`, { method: 'DELETE' }),

  // template
  template: (day: string) =>
    req<AdminTemplateResponse>(`/template?day=${encodeURIComponent(day)}`),
  saveTemplateLesson: (day: string, payload: { className: string; number: number; groups: AdminGroup[] }) =>
    req<{ ok: true }>(`/template/lesson?day=${encodeURIComponent(day)}`, {
      method: 'PUT', body: JSON.stringify(payload),
    }),

  // day (grid по дате)
  day: (date: string) => req<AdminDayResponse>(`/day?date=${date}`),
  saveOverride: (payload: { date: string; className: string; number: number; groups: AdminGroup[] }) =>
    req<{ ok: true }>('/override', { method: 'PUT', body: JSON.stringify(payload) }),
  clearOverride: (payload: { date: string; className: string; number: number }) =>
    req<{ ok: true }>('/override', { method: 'DELETE', body: JSON.stringify(payload) }),

  // distant
  setDistant: (payload: { date: string; className: string; lessonNumber: number | null; note?: string | null }) =>
    req<{ ok: true }>('/distant', { method: 'POST', body: JSON.stringify(payload) }),
  clearDistant: (payload: { date: string; className: string; lessonNumber: number | null }) =>
    req<{ ok: true }>('/distant', { method: 'DELETE', body: JSON.stringify(payload) }),
  setDistantAllClasses: (payload: { date: string; lessonNumber: number | null; note?: string | null }) =>
    req<{ ok: true }>('/distant/all', { method: 'POST', body: JSON.stringify(payload) }),

  // publication
  publishDay: (date: string) => req<{ ok: true }>('/publish/day', { method: 'POST', body: JSON.stringify({ date }) }),
  unpublishDay: (date: string) => req<{ ok: true }>('/publish/day', { method: 'DELETE', body: JSON.stringify({ date }) }),
  publishWeek: (weekStart: string) => req<{ ok: true }>('/publish/week', { method: 'POST', body: JSON.stringify({ weekStart }) }),

  // timeslots
  timeSlots: (day: string) => req<Array<{ id: number; day: string; number: number; timeStart: string; timeEnd: string }>>(`/timeslots?day=${encodeURIComponent(day)}`),
  saveTimeSlot: (payload: { day: string; number: number; timeStart: string; timeEnd: string }) =>
    req<{ ok: true }>('/timeslot', { method: 'PUT', body: JSON.stringify(payload) }),
  resetTimeSlots: (day: string) =>
    req<{ ok: true }>('/timeslots/reset-defaults', { method: 'POST', body: JSON.stringify({ day }) }),
};
