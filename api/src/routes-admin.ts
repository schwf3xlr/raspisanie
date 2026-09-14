import type { FastifyInstance } from 'fastify';
import { db } from './db.js';
import { config, DEFAULT_TIME_SLOTS } from './config.js';
import {
  checkCredentials,
  createSession,
  destroySession,
  isAuthenticated,
  requireAdmin,
} from './auth.js';
import {
  dayNameFromDate,
  formatDateRu,
  fromISODate,
  toDbDate,
  toISODate,
  workdaysOfWeek,
} from './date-utils.js';
import type { GroupRef } from './types.js';
import { sendPush, pushConfigured, type PushResult } from './push.js';

interface LessonUpsertBody {
  className: string;
  number: number;
  groups: GroupRef[];
}

function parseGroups(raw: unknown): GroupRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(x => x && typeof x === 'object') as GroupRef[];
}

export async function registerAdminRoutes(app: FastifyInstance) {
  // ---------- auth ----------
  app.post<{ Body: { login: string; password: string } }>(
    '/api/admin/login', async (req, reply) => {
      const { login, password } = req.body ?? { login: '', password: '' };
      if (typeof login !== 'string' || typeof password !== 'string') {
        return reply.code(400).send({ error: 'Некорректные данные' });
      }
      if (!checkCredentials(login, password)) {
        await new Promise(r => setTimeout(r, 400));
        return reply.code(401).send({ error: 'Неверный логин или пароль' });
      }
      await createSession(reply);
      return { ok: true };
    }
  );
  app.post('/api/admin/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });
  app.get('/api/admin/me', async (req) => ({ authenticated: await isAuthenticated(req) }));

  // ---------- dashboard ----------
  app.get('/api/admin/stats', { preHandler: (req, reply) => requireAdmin(req, reply) }, async () => {
    const [classes, templateLessons, overrides, distant, published, teachers, subjects, rooms] = await Promise.all([
      db.class.count(),
      db.lessonTemplate.count(),
      db.lessonOverride.count(),
      db.distantMark.count(),
      db.publishedDay.count(),
      db.teacher.count(),
      db.subject.count(),
      db.room.count(),
    ]);
    return { classes, templateLessons, overrides, distant, published, teachers, subjects, rooms };
  });

  // ---------- dictionaries ----------
  app.get('/api/admin/dictionaries', { preHandler: (req, reply) => requireAdmin(req, reply) }, async () => {
    const [teachers, subjects, rooms, classes] = await Promise.all([
      db.teacher.findMany({ orderBy: { shortName: 'asc' } }),
      db.subject.findMany({ orderBy: { name: 'asc' } }),
      db.room.findMany({ orderBy: { name: 'asc' } }),
      db.class.findMany({ orderBy: { sortKey: 'asc' } }),
    ]);
    return { teachers, subjects, rooms, classes };
  });

  // Teachers
  app.post<{ Body: { fullName: string; shortName: string } }>(
    '/api/admin/teacher',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const b = req.body;
      if (!b?.fullName?.trim() || !b?.shortName?.trim()) return reply.code(400).send({ error: 'fullName и shortName обязательны' });
      const created = await db.teacher.create({ data: { fullName: b.fullName.trim(), shortName: b.shortName.trim() } }).catch(() => null);
      if (!created) return reply.code(409).send({ error: 'Такой учитель уже есть' });
      return created;
    }
  );
  app.put<{ Params: { id: string }; Body: { fullName: string; shortName: string } }>(
    '/api/admin/teacher/:id',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const id = Number(req.params.id);
      const updated = await db.teacher.update({ where: { id }, data: { fullName: req.body.fullName.trim(), shortName: req.body.shortName.trim() } }).catch(() => null);
      if (!updated) return reply.code(404).send({ error: 'not found' });
      return updated;
    }
  );
  app.delete<{ Params: { id: string } }>(
    '/api/admin/teacher/:id',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const id = Number(req.params.id);
      const usage = await countTeacherUsage(id);
      if (usage > 0) return reply.code(409).send({ error: `Учитель ведёт ${usage} уроков в шаблоне/заменах. Сначала замените.` });
      await db.teacher.delete({ where: { id } }).catch(() => {});
      return { ok: true };
    }
  );

  // Subjects
  app.post<{ Body: { name: string } }>(
    '/api/admin/subject',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const name = req.body?.name?.trim();
      if (!name) return reply.code(400).send({ error: 'name обязателен' });
      const created = await db.subject.create({ data: { name } }).catch(() => null);
      if (!created) return reply.code(409).send({ error: 'Такой предмет уже есть' });
      return created;
    }
  );
  app.put<{ Params: { id: string }; Body: { name: string } }>(
    '/api/admin/subject/:id',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const id = Number(req.params.id);
      const updated = await db.subject.update({ where: { id }, data: { name: req.body.name.trim() } }).catch(() => null);
      if (!updated) return reply.code(404).send({ error: 'not found' });
      return updated;
    }
  );
  app.delete<{ Params: { id: string } }>(
    '/api/admin/subject/:id',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const id = Number(req.params.id);
      const usage = await countSubjectUsage(id);
      if (usage > 0) return reply.code(409).send({ error: `Предмет используется в ${usage} уроках.` });
      await db.subject.delete({ where: { id } }).catch(() => {});
      return { ok: true };
    }
  );

  // Rooms
  app.post<{ Body: { name: string; kind?: string } }>(
    '/api/admin/room',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const name = req.body?.name?.trim();
      if (!name) return reply.code(400).send({ error: 'name обязателен' });
      const created = await db.room.create({ data: { name, kind: req.body.kind ?? 'regular' } }).catch(() => null);
      if (!created) return reply.code(409).send({ error: 'Такой кабинет уже есть' });
      return created;
    }
  );
  app.put<{ Params: { id: string }; Body: { name: string; kind?: string } }>(
    '/api/admin/room/:id',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const id = Number(req.params.id);
      const updated = await db.room.update({ where: { id }, data: { name: req.body.name.trim(), kind: req.body.kind ?? 'regular' } }).catch(() => null);
      if (!updated) return reply.code(404).send({ error: 'not found' });
      return updated;
    }
  );
  app.delete<{ Params: { id: string } }>(
    '/api/admin/room/:id',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const id = Number(req.params.id);
      const usage = await countRoomUsage(id);
      if (usage > 0) return reply.code(409).send({ error: `Кабинет используется в ${usage} уроках.` });
      await db.room.delete({ where: { id } }).catch(() => {});
      return { ok: true };
    }
  );

  // Classes
  app.post<{ Body: { name: string; sortKey?: number } }>(
    '/api/admin/class',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const name = req.body?.name?.trim();
      if (!name) return reply.code(400).send({ error: 'name обязателен' });
      const created = await db.class.create({ data: { name, sortKey: req.body.sortKey ?? guessSortKey(name) } }).catch(() => null);
      if (!created) return reply.code(409).send({ error: 'Такой класс уже есть' });
      return created;
    }
  );
  app.put<{ Params: { id: string }; Body: { name: string; sortKey?: number } }>(
    '/api/admin/class/:id',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const id = Number(req.params.id);
      const cls = await db.class.findUnique({ where: { id } });
      if (!cls) return reply.code(404).send({ error: 'not found' });
      const newName = req.body.name.trim();
      const updated = await db.class.update({ where: { id }, data: { name: newName, sortKey: req.body.sortKey ?? cls.sortKey } }).catch(() => null);
      if (!updated) return reply.code(409).send({ error: 'Не удалось переименовать (возможно, конфликт имени)' });
      // каскадное переименование в связанных таблицах
      if (cls.name !== newName) {
        await db.lessonTemplate.updateMany({ where: { className: cls.name }, data: { className: newName } });
        await db.lessonOverride.updateMany({ where: { className: cls.name }, data: { className: newName } });
        await db.distantMark.updateMany({ where: { className: cls.name }, data: { className: newName } });
      }
      return updated;
    }
  );
  app.delete<{ Params: { id: string } }>(
    '/api/admin/class/:id',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const id = Number(req.params.id);
      const cls = await db.class.findUnique({ where: { id } });
      if (!cls) return reply.code(404).send({ error: 'not found' });
      await db.lessonTemplate.deleteMany({ where: { className: cls.name } });
      await db.lessonOverride.deleteMany({ where: { className: cls.name } });
      await db.distantMark.deleteMany({ where: { className: cls.name } });
      await db.class.delete({ where: { id } });
      return { ok: true };
    }
  );

  // ---------- шаблон (по дню недели) ----------
  app.get<{ Querystring: { day?: string } }>(
    '/api/admin/template',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const day = req.query?.day;
      if (!day || !config.days.includes(day as typeof config.days[number])) {
        return reply.code(400).send({ error: 'нужен параметр day' });
      }
      const [classes, lessons, timeSlots] = await Promise.all([
        db.class.findMany({ orderBy: { sortKey: 'asc' } }),
        db.lessonTemplate.findMany({ where: { day }, orderBy: [{ number: 'asc' }, { className: 'asc' }] }),
        db.timeSlot.findMany({ where: { day }, orderBy: { number: 'asc' } }),
      ]);
      return {
        day,
        classes: classes.map(c => c.name),
        lessons: lessons.map(l => ({
          id: l.id,
          className: l.className,
          number: l.number,
          timeStart: l.timeStart,
          timeEnd: l.timeEnd,
          groups: parseGroups(l.groups),
        })),
        timeSlots: timeSlots.map(t => ({ number: t.number, timeStart: t.timeStart, timeEnd: t.timeEnd })),
      };
    }
  );

  app.put<{ Querystring: { day?: string }; Body: LessonUpsertBody }>(
    '/api/admin/template/lesson',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const day = req.query?.day;
      if (!day || !config.days.includes(day as typeof config.days[number])) {
        return reply.code(400).send({ error: 'нужен параметр day' });
      }
      const b = req.body;
      if (!b?.className || !b?.number) return reply.code(400).send({ error: 'className, number обязательны' });
      const clean = (b.groups ?? []).filter(g => g && typeof g.subjectId === 'number');
      if (clean.length === 0) {
        await db.lessonTemplate.deleteMany({ where: { day, className: b.className, number: b.number } });
        return { ok: true, deleted: true };
      }
      const slot = await db.timeSlot.findUnique({ where: { day_number: { day, number: b.number } } });
      const timeStart = slot?.timeStart ?? '';
      const timeEnd = slot?.timeEnd ?? '';
      const saved = await db.lessonTemplate.upsert({
        where: { day_className_number: { day, className: b.className, number: b.number } },
        create: { day, className: b.className, number: b.number, timeStart, timeEnd, groups: clean as unknown as object },
        update: { timeStart, timeEnd, groups: clean as unknown as object },
      });
      return { ok: true, id: saved.id };
    }
  );

  // ---------- редактор недели: день (грид по классам) ----------
  app.get<{ Querystring: { date?: string } }>(
    '/api/admin/day',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const dateIso = req.query?.date;
      if (!dateIso) return reply.code(400).send({ error: 'нужен параметр date' });
      const date = fromISODate(dateIso);
      const dbDate = toDbDate(dateIso);
      const dayName = dayNameFromDate(date);
      if (!dayName) return reply.code(400).send({ error: 'выходной' });

      const [classes, timeSlots, template, overrides, distant, published] = await Promise.all([
        db.class.findMany({ orderBy: { sortKey: 'asc' } }),
        db.timeSlot.findMany({ where: { day: dayName }, orderBy: { number: 'asc' } }),
        db.lessonTemplate.findMany({ where: { day: dayName } }),
        db.lessonOverride.findMany({ where: { date: dbDate } }),
        db.distantMark.findMany({ where: { date: dbDate } }),
        db.publishedDay.findUnique({ where: { date: dbDate } }),
      ]);

      return {
        date: dateIso,
        day: dayName,
        published: !!published,
        publishedAt: published?.publishedAt?.toISOString() ?? null,
        classes: classes.map(c => c.name),
        timeSlots: timeSlots.map(t => ({ number: t.number, timeStart: t.timeStart, timeEnd: t.timeEnd })),
        template: template.map(l => ({
          id: l.id, className: l.className, number: l.number,
          timeStart: l.timeStart, timeEnd: l.timeEnd, groups: parseGroups(l.groups),
        })),
        overrides: overrides.map(o => ({
          id: o.id, className: o.className, number: o.number,
          timeStart: o.timeStart, timeEnd: o.timeEnd,
          groups: parseGroups(o.groups), isCancelled: o.isCancelled,
        })),
        distant: distant.map(d => ({
          id: d.id, className: d.className, lessonNumber: d.lessonNumber, note: d.note,
        })),
      };
    }
  );

  // Сохранить override: если пусто → отмена урока; если совпадает с шаблоном → удалить override.
  app.put<{ Body: { date: string; className: string; number: number; groups: GroupRef[] } }>(
    '/api/admin/override',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const b = req.body;
      if (!b?.date || !b?.className || !b?.number) return reply.code(400).send({ error: 'нужны date, className, number' });
      const dbDate = toDbDate(b.date);
      const dayName = dayNameFromDate(fromISODate(b.date));
      if (!dayName) return reply.code(400).send({ error: 'выходной' });

      const clean = (b.groups ?? []).filter(g => g && typeof g.subjectId === 'number');
      const slot = await db.timeSlot.findUnique({ where: { day_number: { day: dayName, number: b.number } } });
      const timeStart = slot?.timeStart ?? '';
      const timeEnd = slot?.timeEnd ?? '';

      if (clean.length === 0) {
        // Явная отмена урока: сохраняем override с isCancelled=true
        await db.lessonOverride.upsert({
          where: { date_className_number: { date: dbDate, className: b.className, number: b.number } },
          create: { date: dbDate, className: b.className, number: b.number, timeStart, timeEnd, groups: [] as unknown as object, isCancelled: true },
          update: { timeStart, timeEnd, groups: [] as unknown as object, isCancelled: true },
        });
        return { ok: true, cancelled: true };
      }

      const saved = await db.lessonOverride.upsert({
        where: { date_className_number: { date: dbDate, className: b.className, number: b.number } },
        create: { date: dbDate, className: b.className, number: b.number, timeStart, timeEnd, groups: clean as unknown as object, isCancelled: false },
        update: { timeStart, timeEnd, groups: clean as unknown as object, isCancelled: false },
      });
      return { ok: true, id: saved.id };
    }
  );

  app.delete<{ Body: { date: string; className: string; number: number } }>(
    '/api/admin/override',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req) => {
      const b = req.body;
      const dbDate = toDbDate(b.date);
      await db.lessonOverride.deleteMany({ where: { date: dbDate, className: b.className, number: b.number } });
      return { ok: true };
    }
  );

  // ---------- distant ----------
  app.post<{ Body: { date: string; className: string; lessonNumber: number | null; note?: string | null } }>(
    '/api/admin/distant',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req) => {
      const b = req.body;
      const dbDate = toDbDate(b.date);
      const existing = await db.distantMark.findFirst({
        where: { date: dbDate, className: b.className, lessonNumber: b.lessonNumber ?? null },
      });
      const saved = existing
        ? await db.distantMark.update({ where: { id: existing.id }, data: { note: b.note ?? null } })
        : await db.distantMark.create({
            data: { date: dbDate, className: b.className, lessonNumber: b.lessonNumber ?? null, note: b.note ?? null },
          });
      return { ok: true, id: saved.id };
    }
  );

  app.delete<{ Body: { date: string; className: string; lessonNumber: number | null } }>(
    '/api/admin/distant',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req) => {
      const b = req.body;
      const dbDate = toDbDate(b.date);
      await db.distantMark.deleteMany({
        where: { date: dbDate, className: b.className, lessonNumber: b.lessonNumber ?? null },
      });
      return { ok: true };
    }
  );

  // Дистант для всех классов на этот номер урока
  app.post<{ Body: { date: string; lessonNumber: number | null; note?: string | null } }>(
    '/api/admin/distant/all',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req) => {
      const b = req.body;
      const dbDate = toDbDate(b.date);
      const classes = await db.class.findMany();
      for (const c of classes) {
        const existing = await db.distantMark.findFirst({
          where: { date: dbDate, className: c.name, lessonNumber: b.lessonNumber ?? null },
        });
        if (existing) {
          await db.distantMark.update({ where: { id: existing.id }, data: { note: b.note ?? null } });
        } else {
          await db.distantMark.create({
            data: { date: dbDate, className: c.name, lessonNumber: b.lessonNumber ?? null, note: b.note ?? null },
          });
        }
      }
      return { ok: true };
    }
  );

  // ---------- publication ----------
  app.post<{
    Body: {
      date: string;
      notify?: boolean;
      notifyClasses?: string[]; // если пусто — рассылка всем зарегистрированным
      notifyText?: string;      // кастомный текст, иначе — авто по дате
    };
  }>(
    '/api/admin/publish/day',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req) => {
      const dbDate = toDbDate(req.body.date);
      await db.publishedDay.upsert({
        where: { date: dbDate },
        create: { date: dbDate },
        update: { publishedAt: new Date() },
      });

      let push: PushResult | null = null;
      if (req.body.notify && pushConfigured) {
        const dateLabel = formatDateRu(req.body.date);
        const title = 'Расписание опубликовано';
        const body = req.body.notifyText || `Расписание на ${dateLabel} доступно в приложении`;
        const targets = req.body.notifyClasses && req.body.notifyClasses.length > 0
          ? req.body.notifyClasses
          : [null]; // null → broadcast

        push = { attempted: 0, succeeded: 0, cleaned: 0 };
        for (const cls of targets) {
          const r = await sendPush(
            cls ? { className: cls } : { broadcast: true },
            { title, body, data: { date: req.body.date, className: cls ?? '' } },
          );
          push.attempted += r.attempted;
          push.succeeded += r.succeeded;
          push.cleaned += r.cleaned;
        }
      }

      return { ok: true, push };
    }
  );

  app.delete<{ Body: { date: string } }>(
    '/api/admin/publish/day',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req) => {
      const dbDate = toDbDate(req.body.date);
      await db.publishedDay.deleteMany({ where: { date: dbDate } });
      return { ok: true };
    }
  );

  app.post<{
    Body: {
      weekStart: string;
      notify?: boolean;
      notifyClasses?: string[];
      notifyText?: string;
    };
  }>(
    '/api/admin/publish/week',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req) => {
      const workdays = workdaysOfWeek(fromISODate(req.body.weekStart));
      for (const d of workdays) {
        const dbDate = toDbDate(toISODate(d));
        await db.publishedDay.upsert({
          where: { date: dbDate },
          create: { date: dbDate },
          update: { publishedAt: new Date() },
        });
      }

      let push: PushResult | null = null;
      if (req.body.notify && pushConfigured) {
        const title = 'Расписание опубликовано';
        const body = req.body.notifyText || `Расписание на неделю с ${formatDateRu(req.body.weekStart)} доступно`;
        const targets = req.body.notifyClasses && req.body.notifyClasses.length > 0
          ? req.body.notifyClasses
          : [null];

        push = { attempted: 0, succeeded: 0, cleaned: 0 };
        for (const cls of targets) {
          const r = await sendPush(
            cls ? { className: cls } : { broadcast: true },
            { title, body, data: { weekStart: req.body.weekStart, className: cls ?? '' } },
          );
          push.attempted += r.attempted;
          push.succeeded += r.succeeded;
          push.cleaned += r.cleaned;
        }
      }

      return { ok: true, push };
    }
  );

  // Ручная рассылка — для «6 урок отменён» и подобного.
  app.post<{
    Body: {
      title?: string;
      body: string;
      classes?: string[]; // пусто → всем
    };
  }>(
    '/api/admin/push/broadcast',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const { title, body, classes } = req.body ?? {};
      if (!body || typeof body !== 'string') return reply.code(400).send({ error: 'body обязателен' });
      if (!pushConfigured) return reply.code(503).send({ error: 'FCM не сконфигурирован', hint: 'см. PUSH.md' });

      const targets = classes && classes.length > 0 ? classes : [null];
      let total: PushResult = { attempted: 0, succeeded: 0, cleaned: 0 };
      for (const cls of targets) {
        const r = await sendPush(
          cls ? { className: cls } : { broadcast: true },
          { title: title || 'Уведомление', body, data: { className: cls ?? '' } },
        );
        total = {
          attempted: total.attempted + r.attempted,
          succeeded: total.succeeded + r.succeeded,
          cleaned: total.cleaned + r.cleaned,
        };
      }
      return { ok: true, push: total };
    },
  );

  app.get(
    '/api/admin/push/status',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async () => {
      const [total, byClass] = await Promise.all([
        db.deviceToken.count(),
        db.deviceToken.groupBy({
          by: ['className'],
          _count: { _all: true },
          orderBy: { className: 'asc' },
        }),
      ]);
      return {
        configured: pushConfigured,
        total,
        byClass: byClass.map(r => ({ className: r.className, count: r._count._all })),
      };
    },
  );

  // ---------- звонки ----------
  app.get<{ Querystring: { day?: string } }>(
    '/api/admin/timeslots',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req) => {
      const where = req.query?.day ? { day: req.query.day } : undefined;
      return db.timeSlot.findMany({ where, orderBy: [{ day: 'asc' }, { number: 'asc' }] });
    }
  );
  app.put<{ Body: { day: string; number: number; timeStart: string; timeEnd: string } }>(
    '/api/admin/timeslot',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const { day, number, timeStart, timeEnd } = req.body ?? {} as { day: string; number: number; timeStart: string; timeEnd: string };
      if (!day || !number) return reply.code(400).send({ error: 'day, number обязательны' });
      await db.timeSlot.upsert({
        where: { day_number: { day, number } },
        create: { day, number, timeStart, timeEnd },
        update: { timeStart, timeEnd },
      });
      // подтянуть время в шаблоне
      await db.lessonTemplate.updateMany({ where: { day, number }, data: { timeStart, timeEnd } });
      return { ok: true };
    }
  );
  app.post<{ Body: { day: string } }>(
    '/api/admin/timeslots/reset-defaults',
    { preHandler: (req, reply) => requireAdmin(req, reply) },
    async (req, reply) => {
      const { day } = req.body ?? { day: '' };
      if (!day) return reply.code(400).send({ error: 'day обязателен' });
      for (const s of DEFAULT_TIME_SLOTS) {
        await db.timeSlot.upsert({
          where: { day_number: { day, number: s.number } },
          create: { day, number: s.number, timeStart: s.timeStart, timeEnd: s.timeEnd },
          update: { timeStart: s.timeStart, timeEnd: s.timeEnd },
        });
        await db.lessonTemplate.updateMany({ where: { day, number: s.number }, data: { timeStart: s.timeStart, timeEnd: s.timeEnd } });
      }
      return { ok: true };
    }
  );
}

function guessSortKey(name: string): number {
  const m = name.match(/^(\d{1,2})\s*([А-Яа-яA-Za-z]?)/);
  if (!m) return 9999;
  const parallel = parseInt(m[1]!, 10);
  const letter = (m[2] ?? '').toUpperCase();
  const letterOrder = letter ? letter.charCodeAt(0) - 'А'.charCodeAt(0) + 1 : 0;
  return parallel * 100 + Math.max(0, Math.min(99, letterOrder));
}

// --- helpers для проверки использования справочников ---
async function countTeacherUsage(id: number): Promise<number> {
  const [t, o] = await Promise.all([
    db.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "LessonTemplate", jsonb_array_elements(groups) g WHERE (g->>'teacherId')::int = ${id}`,
    db.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "LessonOverride", jsonb_array_elements(groups) g WHERE (g->>'teacherId')::int = ${id}`,
  ]);
  return Number(t[0]?.n ?? 0) + Number(o[0]?.n ?? 0);
}
async function countSubjectUsage(id: number): Promise<number> {
  const [t, o] = await Promise.all([
    db.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "LessonTemplate", jsonb_array_elements(groups) g WHERE (g->>'subjectId')::int = ${id}`,
    db.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "LessonOverride", jsonb_array_elements(groups) g WHERE (g->>'subjectId')::int = ${id}`,
  ]);
  return Number(t[0]?.n ?? 0) + Number(o[0]?.n ?? 0);
}
async function countRoomUsage(id: number): Promise<number> {
  const [t, o] = await Promise.all([
    db.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "LessonTemplate", jsonb_array_elements(groups) g WHERE (g->>'roomId')::int = ${id}`,
    db.$queryRaw<Array<{ n: bigint }>>`SELECT COUNT(*) AS n FROM "LessonOverride", jsonb_array_elements(groups) g WHERE (g->>'roomId')::int = ${id}`,
  ]);
  return Number(t[0]?.n ?? 0) + Number(o[0]?.n ?? 0);
}
