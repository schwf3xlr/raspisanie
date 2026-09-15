import type { FastifyInstance } from 'fastify';
import { db } from './db.js';
import { config, SCHOOL } from './config.js';
import {
  dayNameFromDate,
  dbDateToISO,
  fromISODate,
  toDbDate,
  toISODate,
  workdaysOfWeek,
} from './date-utils.js';
import type {
  BellChangeDTO,
  DayDTO,
  GroupRef,
  GroupResolved,
  LessonDTO,
  WeekResponse,
} from './types.js';

interface DictRow { id: number; name: string }
interface TeacherRow { id: number; shortName: string }

async function loadDicts() {
  const [subjects, teachers, rooms] = await Promise.all([
    db.subject.findMany(),
    db.teacher.findMany(),
    db.room.findMany(),
  ]);
  const subj = new Map<number, string>(subjects.map(s => [s.id, s.name]));
  const teach = new Map<number, string>(teachers.map(t => [t.id, t.shortName]));
  const room = new Map<number, string>(rooms.map(r => [r.id, r.name]));
  return { subj, teach, room };
}

function resolveGroups(groups: GroupRef[], dicts: { subj: Map<number, string>; teach: Map<number, string>; room: Map<number, string> }): GroupResolved[] {
  return groups.map(g => ({
    subjectId: g.subjectId,
    teacherId: g.teacherId,
    roomId: g.roomId,
    subject: dicts.subj.get(g.subjectId) ?? '',
    teacher: g.teacherId != null ? (dicts.teach.get(g.teacherId) ?? '') : '',
    room: g.roomId != null ? (dicts.room.get(g.roomId) ?? '') : '',
  }));
}

function parseGroups(raw: unknown): GroupRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(x => x && typeof x === 'object') as GroupRef[];
}

// Строгое сравнение двух наборов групп по составу.
// Возвращает true, если override меняет только время (группы совпадают).
function sameGroups(a: GroupRef[], b: GroupRef[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const g1 = a[i]!;
    const g2 = b[i]!;
    if (g1.subjectId !== g2.subjectId) return false;
    if ((g1.teacherId ?? null) !== (g2.teacherId ?? null)) return false;
    if ((g1.roomId ?? null) !== (g2.roomId ?? null)) return false;
  }
  return true;
}

export async function registerRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/school', async () => SCHOOL);

  // Регистрация FCM-токена устройства. Идемпотентно — при повторе обновляется lastSeen/подписка/notifPrefs.
  app.post<{
    Body: {
      token?: string;
      platform?: string;
      className?: string | null;
      teacherId?: number | null;
      notifPrefs?: { publish?: boolean; changes?: boolean; distant?: boolean; manual?: boolean } | null;
    };
  }>(
    '/api/push/register',
    async (req, reply) => {
      const { token, platform, className, teacherId, notifPrefs } = req.body ?? {};
      if (!token || typeof token !== 'string' || token.length < 20) {
        return reply.code(400).send({ error: 'bad token' });
      }
      const cls = typeof className === 'string' && className ? className : null;
      const tid = typeof teacherId === 'number' && Number.isFinite(teacherId) ? teacherId : null;
      // Санитайз prefs: только boolean-поля с известными ключами.
      const prefs = notifPrefs && typeof notifPrefs === 'object'
        ? {
            publish: typeof notifPrefs.publish === 'boolean' ? notifPrefs.publish : true,
            changes: typeof notifPrefs.changes === 'boolean' ? notifPrefs.changes : true,
            distant: typeof notifPrefs.distant === 'boolean' ? notifPrefs.distant : true,
            manual:  typeof notifPrefs.manual  === 'boolean' ? notifPrefs.manual  : true,
          }
        : undefined;

      await db.deviceToken.upsert({
        where: { token },
        create: {
          token,
          platform: platform ?? 'android',
          className: cls,
          teacherId: tid,
          notifPrefs: prefs ?? undefined,
        },
        update: {
          className: cls,
          teacherId: tid,
          platform: platform ?? undefined,
          // Обновляем prefs только если пришли. Иначе оставляем предыдущие.
          notifPrefs: prefs ?? undefined,
          // lastSeen обновляется автоматически (@updatedAt)
        },
      });
      return { ok: true };
    },
  );

  app.post<{ Body: { token: string } }>('/api/push/unregister', async (req, reply) => {
    const { token } = req.body ?? { token: '' };
    if (!token) return reply.code(400).send({ error: 'bad token' });
    await db.deviceToken.deleteMany({ where: { token } });
    return { ok: true };
  });

  app.get('/api/classes', async () => {
    const rows = await db.class.findMany({ orderBy: { sortKey: 'asc' } });
    return { classes: rows.map(r => r.name) };
  });

  app.get('/api/teachers', async () => {
    const rows = await db.teacher.findMany({ orderBy: { shortName: 'asc' } });
    return { teachers: rows.map(t => ({ id: t.id, fullName: t.fullName, shortName: t.shortName })) };
  });

  // День целиком: все классы + все уроки одной таблицей. Публичный эндпоинт.
  // Возвращает published: true/false; если false - lessons: [].
  app.get<{ Querystring: { date?: string } }>(
    '/api/day-all',
    async (req) => {
      const dateIso = req.query?.date ?? toISODate(new Date());
      const dbDate = toDbDate(dateIso);
      const dayName = dayNameFromDate(fromISODate(dateIso));

      const [publishedRow, classes, overrides, distant, timeSlots, dicts] = await Promise.all([
        db.publishedDay.findUnique({ where: { date: dbDate } }),
        db.class.findMany({ orderBy: { sortKey: 'asc' } }),
        db.lessonOverride.findMany({ where: { date: dbDate } }),
        db.distantMark.findMany({ where: { date: dbDate } }),
        dayName ? db.timeSlot.findMany({ where: { day: dayName }, orderBy: { number: 'asc' } }) : Promise.resolve([]),
        loadDicts(),
      ]);
      const templates = dayName
        ? await db.lessonTemplate.findMany({ where: { day: dayName } })
        : [];

      const published = !!publishedRow;

      // Собираем все номера уроков (у разных классов может быть разное количество).
      const numbers = new Set<number>();
      for (const t of templates) numbers.add(t.number);
      for (const o of overrides) numbers.add(o.number);
      for (const s of timeSlots) numbers.add(s.number);
      const sortedNumbers = [...numbers].sort((a, b) => a - b);

      // (className, number) → override
      const overrideByKey = new Map<string, typeof overrides[number]>();
      for (const o of overrides) overrideByKey.set(`${o.className}::${o.number}`, o);
      // (day, className, number) → template
      const templateByKey = new Map<string, typeof templates[number]>();
      for (const t of templates) templateByKey.set(`${t.className}::${t.number}`, t);
      // (className) → note or null; и (className, number) → note
      const distantWholeByClass = new Map<string, string | null>();
      const distantByClassNum = new Map<string, string | null>();
      for (const d of distant) {
        if (d.lessonNumber == null) distantWholeByClass.set(d.className, d.note);
        else distantByClassNum.set(`${d.className}::${d.lessonNumber}`, d.note);
      }

      // Для каждой ячейки собираем итоговый LessonDTO или null (нет урока).
      const cells: Array<{
        className: string;
        number: number;
        lesson: LessonDTO | null;
      }> = [];

      // Сводка изменений звонков на день (одна запись на номер урока).
      const bellChanges: BellChangeDTO[] = [];
      const seenBell = new Set<number>();
      const slotByNum = new Map(timeSlots.map(s => [s.number, s]));

      if (published && dayName) {
        for (const cls of classes) {
          for (const n of sortedNumbers) {
            const override = overrideByKey.get(`${cls.name}::${n}`);
            const template = templateByKey.get(`${cls.name}::${n}`);
            const source = override ?? template;
            if (!source) { cells.push({ className: cls.name, number: n, lesson: null }); continue; }
            if (override?.isCancelled) { cells.push({ className: cls.name, number: n, lesson: null }); continue; }
            const rawGroups = parseGroups(source.groups);
            const groups = resolveGroups(rawGroups, dicts);
            if (groups.length === 0) { cells.push({ className: cls.name, number: n, lesson: null }); continue; }
            const wholeDay = distantWholeByClass.has(cls.name);
            const lessonNote = distantByClassNum.get(`${cls.name}::${n}`);

            const templateGroups = template ? parseGroups(template.groups) : null;
            const isRealReplacement = !!override && (!templateGroups || !sameGroups(rawGroups, templateGroups));

            const slot = slotByNum.get(n);
            const stdStart = slot?.timeStart ?? (template?.timeStart ?? '');
            const stdEnd   = slot?.timeEnd   ?? (template?.timeEnd   ?? '');
            const timeOverridden = !!(source.timeStart && source.timeEnd && (source.timeStart !== stdStart || source.timeEnd !== stdEnd));
            if (timeOverridden && !seenBell.has(n)) {
              seenBell.add(n);
              bellChanges.push({
                number: n,
                timeStart: source.timeStart,
                timeEnd: source.timeEnd,
                standardStart: stdStart,
                standardEnd: stdEnd,
              });
            }

            cells.push({
              className: cls.name,
              number: n,
              lesson: {
                number: n,
                timeStart: source.timeStart,
                timeEnd: source.timeEnd,
                groups,
                fromOverride: isRealReplacement,
                timeOverridden,
                isCancelled: false,
                distant: wholeDay || lessonNote !== undefined
                  ? { lessonLevel: true, note: lessonNote ?? distantWholeByClass.get(cls.name) ?? null }
                  : null,
              },
            });
          }
        }
      }

      // Время на каждый номер урока: берём из timeSlots; если у ячейки override с другим временем -
      // это уже в самой lesson.timeStart/timeEnd.
      const timeByNumber = new Map<number, { timeStart: string; timeEnd: string }>();
      for (const s of timeSlots) timeByNumber.set(s.number, { timeStart: s.timeStart, timeEnd: s.timeEnd });

      bellChanges.sort((a, b) => a.number - b.number);

      return {
        date: dateIso,
        day: dayName,
        published,
        classes: classes.map(c => c.name),
        numbers: sortedNumbers,
        timeByNumber: sortedNumbers.map(n => ({
          number: n,
          timeStart: timeByNumber.get(n)?.timeStart ?? '',
          timeEnd:   timeByNumber.get(n)?.timeEnd ?? '',
        })),
        cells,
        distantAllDayByClass: Object.fromEntries(distantWholeByClass),
        bellChanges,
      };
    },
  );

  // Ученический эндпоинт: неделя вокруг даты для класса.
  // Все дни возвращаются, но published: false скрывает содержимое.
  app.get<{ Params: { className: string }; Querystring: { date?: string } }>(
    '/api/week/:className',
    async (req, reply) => {
      const { className } = req.params;
      const dateIso = req.query?.date;
      const anchor = dateIso ? fromISODate(dateIso) : new Date();
      const workdays = workdaysOfWeek(anchor);

      const cls = await db.class.findUnique({ where: { name: className } });
      if (!cls) return reply.code(404).send({ error: 'Класс не найден' });

      const weekStart = workdays[0]!;
      const weekEnd = workdays[4]!;
      const weekStartDb = toDbDate(toISODate(weekStart));
      const weekEndDb = toDbDate(toISODate(weekEnd));

      const uniqueDays = [...new Set(workdays.map(d => dayNameFromDate(d)!).filter(Boolean))];

      const [published, overrides, distant, dicts, templates, timeSlots] = await Promise.all([
        db.publishedDay.findMany({
          where: { date: { gte: weekStartDb, lte: weekEndDb } },
          select: { date: true },
        }),
        db.lessonOverride.findMany({
          where: { className, date: { gte: weekStartDb, lte: weekEndDb } },
        }),
        db.distantMark.findMany({
          where: { className, date: { gte: weekStartDb, lte: weekEndDb } },
        }),
        loadDicts(),
        db.lessonTemplate.findMany({ where: { className, day: { in: uniqueDays } } }),
        db.timeSlot.findMany({ where: { day: { in: uniqueDays } } }),
      ]);

      const publishedSet = new Set(published.map(p => dbDateToISO(p.date)));
      const overrideByDayNum = new Map<string, typeof overrides[number]>();
      for (const o of overrides) {
        overrideByDayNum.set(`${dbDateToISO(o.date)}::${o.number}`, o);
      }
      const distantByDay = new Map<string, typeof distant>();
      for (const d of distant) {
        const key = dbDateToISO(d.date);
        (distantByDay.get(key) ?? distantByDay.set(key, []).get(key)!).push(d);
      }
      const templateByDayNum = new Map<string, typeof templates[number]>();
      for (const t of templates) templateByDayNum.set(`${t.day}::${t.number}`, t);
      const slotByDayNum = new Map<string, typeof timeSlots[number]>();
      for (const s of timeSlots) slotByDayNum.set(`${s.day}::${s.number}`, s);

      const todayIso = toISODate(new Date());

      const days: DayDTO[] = workdays.map(d => {
        const iso = toISODate(d);
        const dayName = dayNameFromDate(d);
        const isPublished = publishedSet.has(iso);
        const marks = distantByDay.get(iso) ?? [];
        const wholeDay = marks.find(m => m.lessonNumber == null);
        const lessonDistant = new Map<number, { note: string | null }>();
        for (const m of marks) {
          if (m.lessonNumber != null) lessonDistant.set(m.lessonNumber, { note: m.note });
        }

        const dayLessons: LessonDTO[] = [];
        const bellChanges: BellChangeDTO[] = [];
        const seenBellChanges = new Set<number>();
        if (isPublished && dayName) {
          const numbers = new Set<number>();
          for (const t of templates) if (t.day === dayName) numbers.add(t.number);
          for (const [key] of overrideByDayNum) {
            const [oIso, numStr] = key.split('::');
            if (oIso === iso) numbers.add(Number(numStr));
          }
          const sortedNums = [...numbers].sort((a, b) => a - b);

          for (const n of sortedNums) {
            const override = overrideByDayNum.get(`${iso}::${n}`);
            const template = templateByDayNum.get(`${dayName}::${n}`);
            const source = override ?? template;
            if (!source) continue;
            if (override?.isCancelled) continue;
            const rawGroups = parseGroups(source.groups);
            const groups = resolveGroups(rawGroups, dicts);
            if (groups.length === 0) continue;

            // «Замена» - только если реально изменились группы (или урок вообще новый).
            const templateGroups = template ? parseGroups(template.groups) : null;
            const isRealReplacement = !!override && (!templateGroups || !sameGroups(rawGroups, templateGroups));

            // Стандартное время - из TimeSlot этого дня недели.
            const slot = slotByDayNum.get(`${dayName}::${n}`);
            const stdStart = slot?.timeStart ?? (template?.timeStart ?? '');
            const stdEnd   = slot?.timeEnd   ?? (template?.timeEnd   ?? '');
            const timeOverridden = !!(source.timeStart && source.timeEnd && (source.timeStart !== stdStart || source.timeEnd !== stdEnd));

            if (timeOverridden && !seenBellChanges.has(n)) {
              seenBellChanges.add(n);
              bellChanges.push({
                number: n,
                timeStart: source.timeStart,
                timeEnd: source.timeEnd,
                standardStart: stdStart,
                standardEnd: stdEnd,
              });
            }

            dayLessons.push({
              number: n,
              timeStart: source.timeStart,
              timeEnd: source.timeEnd,
              groups,
              fromOverride: isRealReplacement,
              timeOverridden,
              isCancelled: false,
              distant: lessonDistant.has(n)
                ? { lessonLevel: true, note: lessonDistant.get(n)!.note }
                : null,
            });
          }
        }

        return {
          date: iso,
          day: dayName,
          published: isPublished,
          isToday: iso === todayIso,
          isDistantAllDay: !!wholeDay,
          distantAllDayNote: wholeDay?.note ?? null,
          lessons: dayLessons,
          bellChanges,
        };
      });

      const resp: WeekResponse = {
        className,
        weekStart: toISODate(weekStart),
        weekEnd: toISODate(weekEnd),
        days,
      };
      return resp;
    }
  );

  // Учительский эндпоинт: неделя всех уроков конкретного учителя.
  app.get<{ Params: { teacherId: string }; Querystring: { date?: string } }>(
    '/api/week-teacher/:teacherId',
    async (req, reply) => {
      const teacherId = Number(req.params.teacherId);
      if (!Number.isFinite(teacherId)) return reply.code(400).send({ error: 'bad teacherId' });

      const teacher = await db.teacher.findUnique({ where: { id: teacherId } });
      if (!teacher) return reply.code(404).send({ error: 'Учитель не найден' });

      const dateIso = req.query?.date;
      const anchor = dateIso ? fromISODate(dateIso) : new Date();
      const workdays = workdaysOfWeek(anchor);
      const weekStart = workdays[0]!;
      const weekEnd = workdays[4]!;
      const weekStartDb = toDbDate(toISODate(weekStart));
      const weekEndDb = toDbDate(toISODate(weekEnd));

      const uniqueDays = [...new Set(workdays.map(d => dayNameFromDate(d)!).filter(Boolean))];

      // Тянем всё, что может касаться этого учителя. Фильтруем в памяти по teacherId в JSON-груп.
      const [published, allTemplates, allOverrides, allDistant, dicts, allSlots] = await Promise.all([
        db.publishedDay.findMany({
          where: { date: { gte: weekStartDb, lte: weekEndDb } },
          select: { date: true },
        }),
        db.lessonTemplate.findMany({ where: { day: { in: uniqueDays } } }),
        db.lessonOverride.findMany({ where: { date: { gte: weekStartDb, lte: weekEndDb } } }),
        db.distantMark.findMany({ where: { date: { gte: weekStartDb, lte: weekEndDb } } }),
        loadDicts(),
        db.timeSlot.findMany({ where: { day: { in: uniqueDays } } }),
      ]);
      const slotByDayNum2 = new Map<string, typeof allSlots[number]>();
      for (const s of allSlots) slotByDayNum2.set(`${s.day}::${s.number}`, s);

      const publishedSet = new Set(published.map(p => dbDateToISO(p.date)));

      const distantForClassDate = (cls: string, iso: string, n: number) => {
        // приоритет: конкретный урок, потом весь день
        for (const d of allDistant) {
          if (d.className !== cls) continue;
          if (dbDateToISO(d.date) !== iso) continue;
          if (d.lessonNumber === n) return { note: d.note };
        }
        for (const d of allDistant) {
          if (d.className !== cls) continue;
          if (dbDateToISO(d.date) !== iso) continue;
          if (d.lessonNumber == null) return { note: d.note, wholeDay: true };
        }
        return null;
      };

      const days: DayDTO[] = workdays.map(d => {
        const iso = toISODate(d);
        const dayName = dayNameFromDate(d);
        const isPublished = publishedSet.has(iso);

        const dayLessons: LessonDTO[] = [];
        const bellChanges: BellChangeDTO[] = [];
        const seenBellChanges = new Set<number>();
        if (isPublished && dayName) {
          // Для каждого класса собираем эффективный источник (override → template).
          const perClassKeys = new Map<string, Set<number>>(); // className → numbers
          for (const t of allTemplates) if (t.day === dayName) {
            (perClassKeys.get(t.className) ?? perClassKeys.set(t.className, new Set()).get(t.className)!).add(t.number);
          }
          for (const o of allOverrides) if (dbDateToISO(o.date) === iso) {
            (perClassKeys.get(o.className) ?? perClassKeys.set(o.className, new Set()).get(o.className)!).add(o.number);
          }

          for (const [cls, numbers] of perClassKeys) {
            for (const n of numbers) {
              const override = allOverrides.find(o =>
                dbDateToISO(o.date) === iso && o.className === cls && o.number === n
              );
              const template = allTemplates.find(t =>
                t.day === dayName && t.className === cls && t.number === n
              );
              const source = override ?? template;
              if (!source) continue;
              if (override?.isCancelled) continue;
              const groupsRaw = parseGroups(source.groups);
              // Оставляем только те группы, где учитель — наш.
              const myGroups = groupsRaw.filter(g => g.teacherId === teacherId);
              if (myGroups.length === 0) continue;
              const resolved = resolveGroups(myGroups, dicts);
              const dist = distantForClassDate(cls, iso, n);

              // «Замена» - только если реально изменились группы.
              const templateGroups = template ? parseGroups(template.groups) : null;
              const isRealReplacement = !!override && (!templateGroups || !sameGroups(groupsRaw, templateGroups));

              const slot = slotByDayNum2.get(`${dayName}::${n}`);
              const stdStart = slot?.timeStart ?? (template?.timeStart ?? '');
              const stdEnd   = slot?.timeEnd   ?? (template?.timeEnd   ?? '');
              const timeOverridden = !!(source.timeStart && source.timeEnd && (source.timeStart !== stdStart || source.timeEnd !== stdEnd));
              if (timeOverridden && !seenBellChanges.has(n)) {
                seenBellChanges.add(n);
                bellChanges.push({
                  number: n,
                  timeStart: source.timeStart,
                  timeEnd: source.timeEnd,
                  standardStart: stdStart,
                  standardEnd: stdEnd,
                });
              }

              dayLessons.push({
                number: n,
                timeStart: source.timeStart,
                timeEnd: source.timeEnd,
                groups: resolved,
                fromOverride: isRealReplacement,
                timeOverridden,
                isCancelled: false,
                distant: dist ? { lessonLevel: true, note: dist.note ?? null } : null,
                // расширение: показываем ученикам класс, где идёт урок
                className: cls,
              });
            }
          }
          dayLessons.sort((a, b) => a.number - b.number || (a.className ?? '').localeCompare(b.className ?? ''));
          bellChanges.sort((a, b) => a.number - b.number);
        }

        return {
          date: iso,
          day: dayName,
          published: isPublished,
          isToday: iso === toISODate(new Date()),
          isDistantAllDay: false,          // для учителя понятие «весь день дистант» неактуально
          distantAllDayNote: null,
          lessons: dayLessons,
          bellChanges,
        };
      });

      return {
        teacherId,
        teacherName: teacher.shortName,
        weekStart: toISODate(weekStart),
        weekEnd: toISODate(weekEnd),
        days,
      };
    }
  );
}
