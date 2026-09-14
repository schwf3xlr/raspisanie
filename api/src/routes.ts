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

export async function registerRoutes(app: FastifyInstance) {
  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/school', async () => SCHOOL);

  // Регистрация FCM-токена устройства. Идемпотентно — при повторе просто обновляется lastSeen/подписка.
  app.post<{
    Body: {
      token?: string;
      platform?: string;
      className?: string | null;
      teacherId?: number | null;
    };
  }>(
    '/api/push/register',
    async (req, reply) => {
      const { token, platform, className, teacherId } = req.body ?? {};
      if (!token || typeof token !== 'string' || token.length < 20) {
        return reply.code(400).send({ error: 'bad token' });
      }
      const cls = typeof className === 'string' && className ? className : null;
      const tid = typeof teacherId === 'number' && Number.isFinite(teacherId) ? teacherId : null;

      await db.deviceToken.upsert({
        where: { token },
        create: {
          token,
          platform: platform ?? 'android',
          className: cls,
          teacherId: tid,
        },
        update: {
          className: cls,
          teacherId: tid,
          platform: platform ?? undefined,
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

      const [published, overrides, distant, dicts] = await Promise.all([
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

      const todayIso = toISODate(new Date());
      const uniqueDays = [...new Set(workdays.map(d => dayNameFromDate(d)!).filter(Boolean))];
      const templates = await db.lessonTemplate.findMany({
        where: { className, day: { in: uniqueDays } },
      });
      const templateByDayNum = new Map<string, typeof templates[number]>();
      for (const t of templates) templateByDayNum.set(`${t.day}::${t.number}`, t);

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
            const groups = resolveGroups(parseGroups(source.groups), dicts);
            if (groups.length === 0) continue;
            dayLessons.push({
              number: n,
              timeStart: source.timeStart,
              timeEnd: source.timeEnd,
              groups,
              fromOverride: !!override,
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
      const [published, allTemplates, allOverrides, allDistant, dicts] = await Promise.all([
        db.publishedDay.findMany({
          where: { date: { gte: weekStartDb, lte: weekEndDb } },
          select: { date: true },
        }),
        db.lessonTemplate.findMany({ where: { day: { in: uniqueDays } } }),
        db.lessonOverride.findMany({ where: { date: { gte: weekStartDb, lte: weekEndDb } } }),
        db.distantMark.findMany({ where: { date: { gte: weekStartDb, lte: weekEndDb } } }),
        loadDicts(),
      ]);

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
              dayLessons.push({
                number: n,
                timeStart: source.timeStart,
                timeEnd: source.timeEnd,
                groups: resolved,
                fromOverride: !!override,
                isCancelled: false,
                distant: dist ? { lessonLevel: true, note: dist.note ?? null } : null,
                // расширение: показываем ученикам класс, где идёт урок
                className: cls,
              });
            }
          }
          dayLessons.sort((a, b) => a.number - b.number || (a.className ?? '').localeCompare(b.className ?? ''));
        }

        return {
          date: iso,
          day: dayName,
          published: isPublished,
          isToday: iso === toISODate(new Date()),
          isDistantAllDay: false,          // для учителя понятие «весь день дистант» неактуально
          distantAllDayNote: null,
          lessons: dayLessons,
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
