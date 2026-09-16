import type { FastifyInstance } from 'fastify';
import { db } from './db.js';
import { requireRole } from './auth.js';
import {
  sheetsConfigured,
  sheetsServiceAccountEmail,
  importTemplateFromSheet,
  exportTemplateToSheet,
  importScheduleFromSheet,
  exportScheduleToSheet,
  humaniseSheetsError,
} from './sheets.js';

type Kind = 'template' | 'schedule';
type Direction = 'import' | 'export' | 'both';

function isKind(x: unknown): x is Kind { return x === 'template' || x === 'schedule'; }
function isDirection(x: unknown): x is Direction { return x === 'import' || x === 'export' || x === 'both'; }

export async function registerSheetsRoutes(app: FastifyInstance) {
  // Статус модуля - есть ли сервисный аккаунт, его email (админ должен расшарить таблицу).
  app.get(
    '/api/admin/sheets/status',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async () => {
      return {
        configured: sheetsConfigured(),
        serviceAccountEmail: sheetsServiceAccountEmail(),
      };
    },
  );

  // CRUD привязок.
  app.get(
    '/api/admin/sheets',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async () => {
      const rows = await db.sheetsSync.findMany({ orderBy: { id: 'asc' } });
      return { syncs: rows };
    },
  );

  app.post<{ Body: { kind: Kind; direction: Direction; spreadsheetId: string; title?: string } }>(
    '/api/admin/sheets',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async (req, reply) => {
      const b = req.body ?? {} as { kind: unknown; direction: unknown; spreadsheetId: unknown; title?: unknown };
      if (!isKind(b.kind)) return reply.code(400).send({ error: 'kind: template|schedule' });
      if (!isDirection(b.direction)) return reply.code(400).send({ error: 'direction: import|export|both' });
      const sid = String(b.spreadsheetId ?? '').trim();
      if (!sid) return reply.code(400).send({ error: 'spreadsheetId обязателен' });
      const title = typeof b.title === 'string' ? b.title.trim() || null : null;
      const created = await db.sheetsSync.create({
        data: { kind: b.kind, direction: b.direction, spreadsheetId: sid, title },
      });
      return created;
    },
  );

  app.put<{ Params: { id: string }; Body: { kind?: Kind; direction?: Direction; spreadsheetId?: string; title?: string } }>(
    '/api/admin/sheets/:id',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async (req, reply) => {
      const id = Number(req.params.id);
      const cur = await db.sheetsSync.findUnique({ where: { id } });
      if (!cur) return reply.code(404).send({ error: 'not found' });
      const patch: { kind?: string; direction?: string; spreadsheetId?: string; title?: string | null } = {};
      if (req.body.kind !== undefined) {
        if (!isKind(req.body.kind)) return reply.code(400).send({ error: 'kind: template|schedule' });
        patch.kind = req.body.kind;
      }
      if (req.body.direction !== undefined) {
        if (!isDirection(req.body.direction)) return reply.code(400).send({ error: 'direction: import|export|both' });
        patch.direction = req.body.direction;
      }
      if (req.body.spreadsheetId !== undefined) {
        const sid = String(req.body.spreadsheetId ?? '').trim();
        if (!sid) return reply.code(400).send({ error: 'spreadsheetId обязателен' });
        patch.spreadsheetId = sid;
      }
      if (req.body.title !== undefined) patch.title = String(req.body.title ?? '').trim() || null;
      const upd = await db.sheetsSync.update({ where: { id }, data: patch });
      return upd;
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/sheets/:id',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async (req) => {
      const id = Number(req.params.id);
      if (Number.isFinite(id)) await db.sheetsSync.deleteMany({ where: { id } });
      return { ok: true };
    },
  );

  // Запуск операций.
  // Опции в body:
  //   weekStart - для schedule без фильтра, применяется ко всем 5 рабочим дням.
  //   date      - для schedule, один день; неделя вычисляется из даты.
  //   day       - для template, один день недели (Понедельник...Пятница).
  app.post<{ Params: { id: string }; Body?: { weekStart?: string; date?: string; day?: string } }>(
    '/api/admin/sheets/:id/import',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async (req, reply) => {
      if (!sheetsConfigured()) return reply.code(503).send({ error: 'Sheets не сконфигурирован. См. SHEETS.md.' });
      const id = Number(req.params.id);
      const s = await db.sheetsSync.findUnique({ where: { id } });
      if (!s) return reply.code(404).send({ error: 'not found' });
      if (s.direction === 'export') return reply.code(400).send({ error: 'Привязка только на экспорт' });

      try {
        let result: unknown;
        if (s.kind === 'template') {
          const day = req.body?.day ? [req.body.day as never] : null;
          result = await importTemplateFromSheet(s.spreadsheetId, day);
        } else {
          const { weekStart, dates } = resolveWeekAndDates(req.body);
          if (!weekStart) return reply.code(400).send({ error: 'weekStart или date обязателен для schedule' });
          result = await importScheduleFromSheet(s.spreadsheetId, weekStart, dates);
        }
        const summary = summariseResult(result);
        await db.sheetsSync.update({ where: { id }, data: { lastRunAt: new Date(), lastResult: `Импорт: ${summary}` } });
        return { ok: true, result };
      } catch (err) {
        const msg = humaniseSheetsError(err);
        await db.sheetsSync.update({ where: { id }, data: { lastRunAt: new Date(), lastResult: `Ошибка импорта: ${msg}` } }).catch(() => {});
        return reply.code(500).send({ error: msg });
      }
    },
  );

  app.post<{ Params: { id: string }; Body?: { weekStart?: string; date?: string; day?: string } }>(
    '/api/admin/sheets/:id/export',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async (req, reply) => {
      if (!sheetsConfigured()) return reply.code(503).send({ error: 'Sheets не сконфигурирован. См. SHEETS.md.' });
      const id = Number(req.params.id);
      const s = await db.sheetsSync.findUnique({ where: { id } });
      if (!s) return reply.code(404).send({ error: 'not found' });
      if (s.direction === 'import') return reply.code(400).send({ error: 'Привязка только на импорт' });

      try {
        let result: unknown;
        if (s.kind === 'template') {
          const day = req.body?.day ? [req.body.day as never] : null;
          result = await exportTemplateToSheet(s.spreadsheetId, day);
        } else {
          const { weekStart, dates } = resolveWeekAndDates(req.body);
          if (!weekStart) return reply.code(400).send({ error: 'weekStart или date обязателен для schedule' });
          result = await exportScheduleToSheet(s.spreadsheetId, weekStart, dates);
        }
        const summary = summariseResult(result);
        await db.sheetsSync.update({ where: { id }, data: { lastRunAt: new Date(), lastResult: `Экспорт: ${summary}` } });
        return { ok: true, result };
      } catch (err) {
        const msg = humaniseSheetsError(err);
        await db.sheetsSync.update({ where: { id }, data: { lastRunAt: new Date(), lastResult: `Ошибка экспорта: ${msg}` } }).catch(() => {});
        return reply.code(500).send({ error: msg });
      }
    },
  );
}

// Утилита: из body с { weekStart? | date? } вычислить рабочий weekStart (понедельник)
// и опциональный список дат для фильтрации.
function resolveWeekAndDates(body: { weekStart?: string; date?: string; day?: string } | undefined): { weekStart: string | null; dates: string[] | null } {
  const date = body?.date?.trim();
  if (date) {
    const d = new Date(date + 'T00:00:00');
    const dow = d.getDay();
    // Приводим к понедельнику.
    const offset = dow === 0 ? -6 : (1 - dow);
    d.setDate(d.getDate() + offset);
    const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), dd = String(d.getDate()).padStart(2, '0');
    return { weekStart: `${y}-${m}-${dd}`, dates: [date] };
  }
  const ws = body?.weekStart?.trim();
  if (ws) return { weekStart: ws, dates: null };
  return { weekStart: null, dates: null };
}

function summariseResult(r: unknown): string {
  if (!r || typeof r !== 'object') return 'OK';
  const o = r as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof o.lessons === 'number') parts.push(`${o.lessons} уроков`);
  if (typeof o.timeSlots === 'number' && o.timeSlots > 0) parts.push(`${o.timeSlots} звонков`);
  if (typeof o.sheetsWritten === 'number') parts.push(`${o.sheetsWritten} листов`);
  if (typeof o.distantMarks === 'number' && o.distantMarks > 0) parts.push(`${o.distantMarks} дистант`);
  const w = Array.isArray(o.warnings) ? o.warnings : [];
  if (w.length > 0) parts.push(`предупреждений: ${w.length}`);
  return parts.length > 0 ? parts.join(', ') : 'OK';
}
