import { DAYS, type DayName } from './types';

const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн',
  'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

const DOW_TO_NAME: Record<number, DayName> = {
  1: 'Понедельник', 2: 'Вторник', 3: 'Среда', 4: 'Четверг', 5: 'Пятница',
};

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}
export function mondayOf(anchor: Date): Date {
  const d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const dow = d.getDay();
  if (dow === 0) d.setDate(d.getDate() + 1);
  else if (dow === 6) d.setDate(d.getDate() + 2);
  else d.setDate(d.getDate() - (dow - 1));
  return d;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(d.getDate() + n);
  return x;
}
export function dayNameOf(d: Date): DayName | null {
  return DOW_TO_NAME[d.getDay()] ?? null;
}
export function fmtDate(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}
export function fmtDateShort(d: Date): string {
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}
export function fmtWeekLabel(monday: Date): string {
  const fri = addDays(monday, 4);
  if (monday.getMonth() === fri.getMonth()) {
    return `${monday.getDate()}–${fri.getDate()} ${MONTHS_SHORT[monday.getMonth()]}`;
  }
  return `${monday.getDate()} ${MONTHS_SHORT[monday.getMonth()]} – ${fri.getDate()} ${MONTHS_SHORT[fri.getMonth()]}`;
}
export function isSameDate(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function nowMinutes(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}
export function timeToMinutes(s: string): number | null {
  const m = s.match(/(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}
export interface LessonStatus {
  status: 'done' | 'now' | 'upcoming';
  progress?: number;
  minutesLeft?: number;
}
export function lessonStatus(timeStart: string, timeEnd: string, isToday: boolean): LessonStatus {
  if (!isToday) return { status: 'upcoming' };
  const start = timeToMinutes(timeStart);
  const end = timeToMinutes(timeEnd);
  if (start == null || end == null) return { status: 'upcoming' };
  const now = nowMinutes();
  if (now < start) return { status: 'upcoming' };
  if (now < end) {
    const total = end - start || 1;
    return { status: 'now', progress: (now - start) / total, minutesLeft: end - now };
  }
  return { status: 'done' };
}
export function relativeBadge(d: Date): 'сегодня' | 'завтра' | null {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return 'сегодня';
  if (diff === 1) return 'завтра';
  return null;
}

export { DAYS };
