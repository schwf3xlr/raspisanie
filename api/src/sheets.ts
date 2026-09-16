import { readFileSync, existsSync } from 'node:fs';
import { google, sheets_v4 } from 'googleapis';
import { JWT } from 'google-auth-library';
import { config, type DayName } from './config.js';
import { db } from './db.js';
import type { GroupRef } from './types.js';
import { dayNameFromDate, fromISODate, toDbDate, toISODate, workdaysOfWeek } from './date-utils.js';

// ---------- Auth ----------

let cachedClient: JWT | null = null;
let cachedSaEmail: string | null = null;

function loadServiceAccount(): { email: string; key: string } | null {
  const inline = config.sheetsSaJson?.trim();
  const file = config.sheetsSaFile?.trim();
  let raw: string | null = null;
  if (inline) raw = inline;
  else if (file && existsSync(file)) {
    try { raw = readFileSync(file, 'utf8'); } catch { raw = null; }
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { client_email?: string; private_key?: string };
    if (!parsed.client_email || !parsed.private_key) return null;
    return { email: parsed.client_email, key: parsed.private_key };
  } catch { return null; }
}

export function sheetsConfigured(): boolean {
  return loadServiceAccount() !== null;
}

export function sheetsServiceAccountEmail(): string | null {
  if (cachedSaEmail !== null) return cachedSaEmail;
  const sa = loadServiceAccount();
  cachedSaEmail = sa?.email ?? null;
  return cachedSaEmail;
}

function getClient(): sheets_v4.Sheets {
  if (!cachedClient) {
    const sa = loadServiceAccount();
    if (!sa) throw new Error('Google service-account не сконфигурирован. См. SHEETS.md.');
    cachedClient = new JWT({
      email: sa.email,
      key: sa.key,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
  }
  // Каст через unknown - в реальном runtime JWT совместим с OAuth2Client, но у нас
  // разошлись версии google-auth-library внутри googleapis и в корневом node_modules.
  return google.sheets({ version: 'v4', auth: cachedClient as unknown as never });
}

// ---------- Формат таблицы ----------

const DAYS: DayName[] = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'];
// Как названы листы в реальной таблице (в нижнем регистре, tolerantно).
const DAY_SHEET_TITLES: Record<DayName, string[]> = {
  'Понедельник': ['Понедельник', 'понедельник', 'ПОНЕДЕЛЬНИК'],
  'Вторник':     ['Вторник', 'вторник', 'ВТОРНИК'],
  'Среда':       ['Среда', 'среда', 'СРЕДА'],
  'Четверг':     ['Четверг', 'четверг', 'ЧЕТВЕРГ'],
  'Пятница':     ['Пятница', 'пятница', 'ПЯТНИЦА'],
};

const BELLS_RANGE = 'B8:B15';     // 8 строк - 8 уроков
const CLASSES_RANGE = 'C7:S7';    // до 17 классов
const LESSONS_RANGE = 'C8:S15';   // матрица уроков (8 строк × до 17 классов)
const LESSON_NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8];

interface ClassHeader {
  raw: string;
  className: string;   // '5А'
  distant: boolean;    // true если в имени была пометка «дист.» / «д.о.»
  colIndex: number;    // 0..16
}

// «5А ДИСТ.», «5А Д.О.», «5А д/о» → { '5А', true }.
function parseClassCell(raw: string): ClassHeader | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // Ищем в конце: «дист.», «д.о.», «д/о», «д.об.»
  const distantRe = /\s+(дист\.?|д\.?\s*о\.?|д\/о)\s*$/iu;
  const distant = distantRe.test(trimmed);
  const className = trimmed.replace(distantRe, '').trim();
  if (!className) return null;
  return { raw: trimmed, className, distant, colIndex: -1 };
}

// «8:10 - 8:50» → { start: '8:10', end: '8:50' }. Разделители: «-», «—», «–».
function parseTimeCell(raw: string): { start: string; end: string } | null {
  const m = String(raw ?? '').trim().match(/^\s*(\d{1,2}[:\.\s]\d{2})\s*[-–—]\s*(\d{1,2}[:\.\s]\d{2})\s*$/u);
  if (!m) return null;
  const norm = (s: string) => s.replace(/[.\s]/, ':').replace(/^0(\d):/, '$1:');
  return { start: norm(m[1]!), end: norm(m[2]!) };
}

// Разбирает ячейку урока: три строки на подгруппу (предмет / учитель / кабинет).
// Если строк меньше 3 - трактуем как одну подгруппу с недостающими пустыми полями.
// Пример: «Физ.культура\nПанов А.В.\nс/з» → [{ subject, teacher, room }].
// Пример деления: «Технология Д\nДроботун Л.Н.\n101 кб.\nТехнология М\nПанов А.В.\n107а кб.» → 2 подгруппы.
interface ParsedGroupText {
  subject: string;
  teacher: string; // shortName учителя
  room: string;    // название кабинета
}
function parseLessonCell(raw: string): ParsedGroupText[] {
  const lines = String(raw ?? '')
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);
  if (lines.length === 0) return [];
  const groups: ParsedGroupText[] = [];
  // Идём тройками. Если хвост меньше 3 - трактуем как последнюю подгруппу с пустыми полями.
  for (let i = 0; i < lines.length; i += 3) {
    const subject = lines[i] ?? '';
    const teacher = lines[i + 1] ?? '';
    const room    = lines[i + 2] ?? '';
    if (!subject) continue;
    groups.push({ subject, teacher, room });
  }
  return groups;
}

// Сериализация обратно в ячейку - три строки на подгруппу.
function serializeLessonCell(groups: ParsedGroupText[]): string {
  return groups
    .map(g => [g.subject, g.teacher, g.room].filter(x => x != null).join('\n'))
    .join('\n');
}

// Название листа под конкретный день недели. Возвращает точное имя, как оно записано в таблице.
async function resolveSheetTitleForDay(sheets: sheets_v4.Sheets, spreadsheetId: string, day: DayName): Promise<string | null> {
  const meta = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties.title' });
  const titles = (meta.data.sheets ?? []).map(s => s.properties?.title ?? '');
  const wanted = DAY_SHEET_TITLES[day];
  for (const t of titles) {
    if (wanted.some(w => t.trim().toLowerCase() === w.toLowerCase())) return t;
  }
  return null;
}

// ---------- Импорт стандартного расписания ----------

interface ImportResult {
  ok: boolean;
  lessons: number;         // сколько уроков создано/обновлено
  timeSlots: number;       // сколько звонков применено
  classesDistant: number;  // сколько классов с пометкой «дист.» найдено
  warnings: string[];
}

export async function importTemplateFromSheet(spreadsheetId: string): Promise<ImportResult> {
  const sheets = getClient();
  const warnings: string[] = [];

  // Загружаем справочники + функции lookup-or-create.
  const [subjects, teachers, rooms, classes] = await Promise.all([
    db.subject.findMany(),
    db.teacher.findMany(),
    db.room.findMany(),
    db.class.findMany(),
  ]);
  const subjectByLower = new Map(subjects.map(s => [s.name.trim().toLowerCase(), s]));
  const teacherByLower = new Map(teachers.map(t => [t.shortName.trim().toLowerCase(), t]));
  const roomByLower = new Map(rooms.map(r => [r.name.trim().toLowerCase(), r]));
  const classNames = new Set(classes.map(c => c.name));

  const resolveSubjectId = async (name: string): Promise<number> => {
    const key = name.toLowerCase();
    let s = subjectByLower.get(key);
    if (!s) { s = await db.subject.create({ data: { name } }); subjectByLower.set(key, s); }
    return s.id;
  };
  const resolveTeacherId = async (shortName: string): Promise<number | null> => {
    if (!shortName) return null;
    const key = shortName.toLowerCase();
    let t = teacherByLower.get(key);
    if (!t) {
      // Автосоздаём с fullName = shortName (админ потом уточнит через Справочники).
      t = await db.teacher.create({ data: { fullName: shortName, shortName } }).catch(() => undefined as never);
      if (t) teacherByLower.set(key, t);
    }
    return t?.id ?? null;
  };
  const resolveRoomId = async (name: string): Promise<number | null> => {
    if (!name) return null;
    const key = name.toLowerCase();
    let r = roomByLower.get(key);
    if (!r) {
      r = await db.room.create({ data: { name, kind: 'regular' } }).catch(() => undefined as never);
      if (r) roomByLower.set(key, r);
    }
    return r?.id ?? null;
  };

  let totalLessons = 0;
  let totalSlots = 0;
  let classesDistant = 0;

  // Собираем override для каждого дня.
  for (const day of DAYS) {
    const sheetTitle = await resolveSheetTitleForDay(sheets, spreadsheetId, day);
    if (!sheetTitle) {
      warnings.push(`Лист «${day}» не найден - пропущен.`);
      continue;
    }

    const [bellsRes, classesRes, lessonsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheetTitle}'!${BELLS_RANGE}`, valueRenderOption: 'FORMATTED_VALUE' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheetTitle}'!${CLASSES_RANGE}`, valueRenderOption: 'FORMATTED_VALUE' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheetTitle}'!${LESSONS_RANGE}`, valueRenderOption: 'FORMATTED_VALUE' }),
    ]);

    // Bells: одномерный массив из 8 строк.
    const bells = bellsRes.data.values ?? [];
    for (let i = 0; i < LESSON_NUMBERS.length; i++) {
      const raw = String(bells[i]?.[0] ?? '').trim();
      const t = parseTimeCell(raw);
      if (!t) continue;
      await db.timeSlot.upsert({
        where: { day_number: { day, number: LESSON_NUMBERS[i]! } },
        create: { day, number: LESSON_NUMBERS[i]!, timeStart: t.start, timeEnd: t.end },
        update: { timeStart: t.start, timeEnd: t.end },
      });
      totalSlots++;
    }

    // Classes: одна строка. C7 = index 0.
    const rowHeaders = (classesRes.data.values?.[0] ?? []);
    const headers: ClassHeader[] = [];
    for (let i = 0; i < rowHeaders.length; i++) {
      const h = parseClassCell(String(rowHeaders[i] ?? ''));
      if (!h) continue;
      h.colIndex = i;
      headers.push(h);
    }

    // Lessons: 8 строк × N колонок.
    const lessonRows = lessonsRes.data.values ?? [];

    // Отметить distant-статус классов для override-логики - но importTemplate работает
    // с шаблоном, а не с override. Пометки «дист.» из шаблона игнорируем (шаблон - без дистанта),
    // только предупреждение админу.
    const distantClassesThisDay = headers.filter(h => h.distant).map(h => h.className);
    if (distantClassesThisDay.length > 0) {
      warnings.push(`«${day}»: у классов ${distantClassesThisDay.join(', ')} стоит пометка «дист.» - в стандартное расписание она не переносится (это override-состояние).`);
      classesDistant += distantClassesThisDay.length;
    }

    for (const h of headers) {
      if (!classNames.has(h.className)) {
        warnings.push(`«${day}»: класс «${h.className}» отсутствует в справочнике - пропущен.`);
        continue;
      }
      // Собираем список уроков для этого класса в этот день.
      // Перед перезаписью удаляем существующий шаблон этого класса × этого дня.
      await db.lessonTemplate.deleteMany({ where: { day, className: h.className } });

      for (let rowIdx = 0; rowIdx < LESSON_NUMBERS.length; rowIdx++) {
        const number = LESSON_NUMBERS[rowIdx]!;
        const cellRaw = String(lessonRows[rowIdx]?.[h.colIndex] ?? '');
        const parsed = parseLessonCell(cellRaw);
        if (parsed.length === 0) continue;
        const groups: GroupRef[] = [];
        for (const g of parsed) {
          groups.push({
            subjectId: await resolveSubjectId(g.subject),
            teacherId: await resolveTeacherId(g.teacher),
            roomId: await resolveRoomId(g.room),
          });
        }
        const slot = await db.timeSlot.findUnique({ where: { day_number: { day, number } } });
        await db.lessonTemplate.create({
          data: {
            day,
            className: h.className,
            number,
            timeStart: slot?.timeStart ?? '',
            timeEnd: slot?.timeEnd ?? '',
            groups: groups as unknown as object,
          },
        });
        totalLessons++;
      }
    }
  }

  return { ok: true, lessons: totalLessons, timeSlots: totalSlots, classesDistant, warnings };
}

// ---------- Экспорт стандартного расписания ----------

export async function exportTemplateToSheet(spreadsheetId: string): Promise<{ ok: boolean; sheetsWritten: number; warnings: string[] }> {
  const sheets = getClient();
  const warnings: string[] = [];

  const [subjects, teachers, rooms, classes] = await Promise.all([
    db.subject.findMany(),
    db.teacher.findMany(),
    db.room.findMany(),
    db.class.findMany({ orderBy: { sortKey: 'asc' } }),
  ]);
  const subjectById = new Map(subjects.map(s => [s.id, s]));
  const teacherById = new Map(teachers.map(t => [t.id, t]));
  const roomById = new Map(rooms.map(r => [r.id, r]));

  const cellForGroups = (groupsRaw: GroupRef[]): string => {
    if (!Array.isArray(groupsRaw) || groupsRaw.length === 0) return '';
    const parsed: ParsedGroupText[] = groupsRaw.map(g => ({
      subject: subjectById.get(g.subjectId)?.name ?? '',
      teacher: g.teacherId != null ? (teacherById.get(g.teacherId)?.shortName ?? '') : '',
      room:    g.roomId    != null ? (roomById.get(g.roomId)?.name ?? '')       : '',
    }));
    return serializeLessonCell(parsed);
  };

  let sheetsWritten = 0;

  for (const day of DAYS) {
    const sheetTitle = await resolveSheetTitleForDay(sheets, spreadsheetId, day);
    if (!sheetTitle) {
      warnings.push(`Лист «${day}» не найден - пропущен.`);
      continue;
    }

    const [templates, timeSlots] = await Promise.all([
      db.lessonTemplate.findMany({ where: { day } }),
      db.timeSlot.findMany({ where: { day }, orderBy: { number: 'asc' } }),
    ]);
    const tplByKey = new Map(templates.map(t => [`${t.className}::${t.number}`, t]));

    // Классы в порядке sortKey, ограничиваемся 17 (сколько влезает в C..S).
    const cols = classes.slice(0, 17);

    // Bells (B8:B15).
    const bellsRows: (string | null)[][] = LESSON_NUMBERS.map(n => {
      const s = timeSlots.find(x => x.number === n);
      return [s ? `${s.timeStart} - ${s.timeEnd}` : ''];
    });

    // Classes (C7:S7). Дистант в шаблон не пишем.
    const classHeaderRow: (string | null)[][] = [cols.map(c => c.name)];

    // Lessons (C8:S15).
    const lessonRows: (string | null)[][] = LESSON_NUMBERS.map(n =>
      cols.map(c => {
        const tpl = tplByKey.get(`${c.name}::${n}`);
        if (!tpl) return '';
        return cellForGroups(tpl.groups as unknown as GroupRef[]);
      }),
    );

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `'${sheetTitle}'!${BELLS_RANGE}`, values: bellsRows },
          { range: `'${sheetTitle}'!${CLASSES_RANGE}`, values: classHeaderRow },
          { range: `'${sheetTitle}'!${LESSONS_RANGE}`, values: lessonRows },
        ],
      },
    });
    sheetsWritten++;
  }

  return { ok: true, sheetsWritten, warnings };
}

// ---------- Импорт «расписания на неделю» (override) ----------

// weekMondayIso - дата понедельника; импорт применит расписание на 5 рабочих дней этой недели.
// «5А ДИСТ.» - весь день у класса помечается как дистанционный (DistantMark).
export async function importScheduleFromSheet(
  spreadsheetId: string,
  weekMondayIso: string,
): Promise<ImportResult & { distantMarks: number }> {
  const sheets = getClient();
  const warnings: string[] = [];

  const [subjects, teachers, rooms, classes] = await Promise.all([
    db.subject.findMany(),
    db.teacher.findMany(),
    db.room.findMany(),
    db.class.findMany(),
  ]);
  const subjectByLower = new Map(subjects.map(s => [s.name.trim().toLowerCase(), s]));
  const teacherByLower = new Map(teachers.map(t => [t.shortName.trim().toLowerCase(), t]));
  const roomByLower = new Map(rooms.map(r => [r.name.trim().toLowerCase(), r]));
  const classNames = new Set(classes.map(c => c.name));

  const resolveSubjectId = async (name: string): Promise<number> => {
    const key = name.toLowerCase();
    let s = subjectByLower.get(key);
    if (!s) { s = await db.subject.create({ data: { name } }); subjectByLower.set(key, s); }
    return s.id;
  };
  const resolveTeacherId = async (shortName: string): Promise<number | null> => {
    if (!shortName) return null;
    const key = shortName.toLowerCase();
    let t = teacherByLower.get(key);
    if (!t) {
      t = await db.teacher.create({ data: { fullName: shortName, shortName } }).catch(() => undefined as never);
      if (t) teacherByLower.set(key, t);
    }
    return t?.id ?? null;
  };
  const resolveRoomId = async (name: string): Promise<number | null> => {
    if (!name) return null;
    const key = name.toLowerCase();
    let r = roomByLower.get(key);
    if (!r) {
      r = await db.room.create({ data: { name, kind: 'regular' } }).catch(() => undefined as never);
      if (r) roomByLower.set(key, r);
    }
    return r?.id ?? null;
  };

  const workdays = workdaysOfWeek(fromISODate(weekMondayIso));

  let totalLessons = 0;
  let totalSlots = 0;
  let distantMarks = 0;
  let classesDistant = 0;

  for (const workday of workdays) {
    const iso = toISODate(workday);
    const day = dayNameFromDate(workday);
    if (!day) continue;
    const dbDate = toDbDate(iso);

    const sheetTitle = await resolveSheetTitleForDay(sheets, spreadsheetId, day);
    if (!sheetTitle) {
      warnings.push(`Лист «${day}» не найден - пропущен.`);
      continue;
    }

    const [bellsRes, classesRes, lessonsRes] = await Promise.all([
      sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheetTitle}'!${BELLS_RANGE}`, valueRenderOption: 'FORMATTED_VALUE' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheetTitle}'!${CLASSES_RANGE}`, valueRenderOption: 'FORMATTED_VALUE' }),
      sheets.spreadsheets.values.get({ spreadsheetId, range: `'${sheetTitle}'!${LESSONS_RANGE}`, valueRenderOption: 'FORMATTED_VALUE' }),
    ]);

    // Bells на конкретную дату не идут в timeSlot напрямую (это шаблон),
    // но нужны для timeStart/timeEnd в override.
    const bells = bellsRes.data.values ?? [];
    const dayBells = new Map<number, { start: string; end: string }>();
    for (let i = 0; i < LESSON_NUMBERS.length; i++) {
      const t = parseTimeCell(String(bells[i]?.[0] ?? ''));
      if (t) dayBells.set(LESSON_NUMBERS[i]!, t);
    }
    // Сравнение с шаблоном звонков (если время отличается - override поставит своё).
    const slots = await db.timeSlot.findMany({ where: { day } });
    const slotByNum = new Map(slots.map(s => [s.number, s]));

    const rowHeaders = (classesRes.data.values?.[0] ?? []);
    const headers: ClassHeader[] = [];
    for (let i = 0; i < rowHeaders.length; i++) {
      const h = parseClassCell(String(rowHeaders[i] ?? ''));
      if (!h) continue;
      h.colIndex = i;
      headers.push(h);
    }

    const lessonRows = lessonsRes.data.values ?? [];

    for (const h of headers) {
      if (!classNames.has(h.className)) {
        warnings.push(`«${day}»: класс «${h.className}» отсутствует - пропущен.`);
        continue;
      }

      if (h.distant) {
        // Весь день у этого класса - дистант.
        const existing = await db.distantMark.findFirst({
          where: { date: dbDate, className: h.className, lessonNumber: null },
        });
        if (!existing) {
          await db.distantMark.create({ data: { date: dbDate, className: h.className, lessonNumber: null, note: null } });
        }
        distantMarks++;
        classesDistant++;
      }

      // Проходим по всем строкам уроков.
      for (let rowIdx = 0; rowIdx < LESSON_NUMBERS.length; rowIdx++) {
        const number = LESSON_NUMBERS[rowIdx]!;
        const cellRaw = String(lessonRows[rowIdx]?.[h.colIndex] ?? '');
        const parsed = parseLessonCell(cellRaw);
        const bellsForNum = dayBells.get(number);
        const stdSlot = slotByNum.get(number);
        const timeStart = bellsForNum?.start ?? stdSlot?.timeStart ?? '';
        const timeEnd   = bellsForNum?.end   ?? stdSlot?.timeEnd   ?? '';

        if (parsed.length === 0) {
          // Урока нет - override с isCancelled=true, если ранее был запланирован.
          const tpl = await db.lessonTemplate.findFirst({ where: { day, className: h.className, number } });
          if (tpl) {
            await db.lessonOverride.upsert({
              where: { date_className_number: { date: dbDate, className: h.className, number } },
              create: { date: dbDate, className: h.className, number, timeStart, timeEnd, groups: [] as unknown as object, isCancelled: true },
              update: { timeStart, timeEnd, groups: [] as unknown as object, isCancelled: true },
            });
          }
          continue;
        }

        const groups: GroupRef[] = [];
        for (const g of parsed) {
          groups.push({
            subjectId: await resolveSubjectId(g.subject),
            teacherId: await resolveTeacherId(g.teacher),
            roomId: await resolveRoomId(g.room),
          });
        }
        await db.lessonOverride.upsert({
          where: { date_className_number: { date: dbDate, className: h.className, number } },
          create: { date: dbDate, className: h.className, number, timeStart, timeEnd, groups: groups as unknown as object, isCancelled: false },
          update: { timeStart, timeEnd, groups: groups as unknown as object, isCancelled: false },
        });
        totalLessons++;
      }
    }
    totalSlots += dayBells.size;
  }

  return { ok: true, lessons: totalLessons, timeSlots: totalSlots, classesDistant, distantMarks, warnings };
}

// ---------- Экспорт «расписания на неделю» ----------

export async function exportScheduleToSheet(
  spreadsheetId: string,
  weekMondayIso: string,
): Promise<{ ok: boolean; sheetsWritten: number; warnings: string[] }> {
  const sheets = getClient();
  const warnings: string[] = [];

  const [subjects, teachers, rooms, classes] = await Promise.all([
    db.subject.findMany(),
    db.teacher.findMany(),
    db.room.findMany(),
    db.class.findMany({ orderBy: { sortKey: 'asc' } }),
  ]);
  const subjectById = new Map(subjects.map(s => [s.id, s]));
  const teacherById = new Map(teachers.map(t => [t.id, t]));
  const roomById = new Map(rooms.map(r => [r.id, r]));

  const cellForGroups = (groupsRaw: GroupRef[]): string => {
    if (!Array.isArray(groupsRaw) || groupsRaw.length === 0) return '';
    const parsed: ParsedGroupText[] = groupsRaw.map(g => ({
      subject: subjectById.get(g.subjectId)?.name ?? '',
      teacher: g.teacherId != null ? (teacherById.get(g.teacherId)?.shortName ?? '') : '',
      room:    g.roomId    != null ? (roomById.get(g.roomId)?.name ?? '')       : '',
    }));
    return serializeLessonCell(parsed);
  };

  const workdays = workdaysOfWeek(fromISODate(weekMondayIso));
  let sheetsWritten = 0;

  for (const workday of workdays) {
    const iso = toISODate(workday);
    const day = dayNameFromDate(workday);
    if (!day) continue;
    const dbDate = toDbDate(iso);

    const sheetTitle = await resolveSheetTitleForDay(sheets, spreadsheetId, day);
    if (!sheetTitle) {
      warnings.push(`Лист «${day}» не найден - пропущен.`);
      continue;
    }

    const [templates, overrides, distant, slots] = await Promise.all([
      db.lessonTemplate.findMany({ where: { day } }),
      db.lessonOverride.findMany({ where: { date: dbDate } }),
      db.distantMark.findMany({ where: { date: dbDate } }),
      db.timeSlot.findMany({ where: { day }, orderBy: { number: 'asc' } }),
    ]);
    const tplByKey = new Map(templates.map(t => [`${t.className}::${t.number}`, t]));
    const ovByKey  = new Map(overrides.map(o => [`${o.className}::${o.number}`, o]));
    const distantWholeByClass = new Set(distant.filter(d => d.lessonNumber == null).map(d => d.className));

    const cols = classes.slice(0, 17);

    // Bells: если у любого класса есть override с нестандартным временем - берём его.
    const bellsRows: (string | null)[][] = LESSON_NUMBERS.map(n => {
      const std = slots.find(s => s.number === n);
      const anyOv = overrides.find(o => o.number === n && o.timeStart && o.timeEnd && (o.timeStart !== std?.timeStart || o.timeEnd !== std?.timeEnd));
      const ts = anyOv?.timeStart ?? std?.timeStart ?? '';
      const te = anyOv?.timeEnd ?? std?.timeEnd ?? '';
      return [ts && te ? `${ts} - ${te}` : ''];
    });

    // Classes: если у класса весь день дистант - добавим « ДИСТ.»
    const classHeaderRow: (string | null)[][] = [cols.map(c => distantWholeByClass.has(c.name) ? `${c.name} ДИСТ.` : c.name)];

    // Lessons: для каждой пары override приоритет, иначе шаблон.
    const lessonRows: (string | null)[][] = LESSON_NUMBERS.map(n =>
      cols.map(c => {
        const ov = ovByKey.get(`${c.name}::${n}`);
        if (ov?.isCancelled) return '';
        const source = ov ?? tplByKey.get(`${c.name}::${n}`);
        if (!source) return '';
        return cellForGroups(source.groups as unknown as GroupRef[]);
      }),
    );

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: [
          { range: `'${sheetTitle}'!${BELLS_RANGE}`, values: bellsRows },
          { range: `'${sheetTitle}'!${CLASSES_RANGE}`, values: classHeaderRow },
          { range: `'${sheetTitle}'!${LESSONS_RANGE}`, values: lessonRows },
        ],
      },
    });
    sheetsWritten++;
  }

  return { ok: true, sheetsWritten, warnings };
}
