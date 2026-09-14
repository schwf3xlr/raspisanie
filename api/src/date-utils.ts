import type { DayName } from './config.js';

const DAY_BY_DOW: Record<number, DayName> = {
  1: 'Понедельник', 2: 'Вторник', 3: 'Среда', 4: 'Четверг', 5: 'Пятница',
};

// Возвращает YYYY-MM-DD в локальном времени (в БД храним как @db.Date, время не важно)
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Парсит YYYY-MM-DD как локальную дату (не UTC).
export function fromISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

// Понедельник недели, содержащей date. Для субботы/воскресенья — следующий понедельник (для ученика).
export function mondayOfWeek(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay(); // 0=Sunday..6=Saturday
  if (dow === 0) d.setDate(d.getDate() + 1); // воскресенье → следующий пн
  else if (dow === 6) d.setDate(d.getDate() + 2); // суббота → следующий пн
  else d.setDate(d.getDate() - (dow - 1));
  return d;
}

// Пять рабочих дней недели (пн-пт) как список дат.
export function workdaysOfWeek(anyDate: Date): Date[] {
  const mon = mondayOfWeek(anyDate);
  return Array.from({ length: 5 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

// Возвращает имя дня недели (Понедельник..Пятница) или null для выходных.
export function dayNameFromDate(date: Date): DayName | null {
  return DAY_BY_DOW[date.getDay()] ?? null;
}

// Начало и конец недели (пн 00:00 — пт конец) для запросов в БД.
export function weekRange(anyDate: Date): { monday: Date; friday: Date } {
  const mon = mondayOfWeek(anyDate);
  const fri = new Date(mon);
  fri.setDate(mon.getDate() + 4);
  return { monday: mon, friday: fri };
}

// Из «YYYY-MM-DD» → Date @ midnight UTC (для сравнения с @db.Date).
// Prisma при @db.Date хранит и возвращает как UTC midnight; для локальных Date из fromISODate
// это не совпадает. Используем UTC-версии в БД-запросах.
export function toDbDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

// Обратный ход: Date из БД (@db.Date, UTC midnight) → YYYY-MM-DD.
export function dbDateToISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const RU_MONTHS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

// ISO YYYY-MM-DD → «15 сентября»
export function formatDateRu(iso: string): string {
  const [_, m, d] = iso.split('-').map(Number);
  const month = RU_MONTHS[(m ?? 1) - 1];
  return `${d} ${month}`;
}
