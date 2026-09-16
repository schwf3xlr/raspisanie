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
  app.post<{ Params: { id: string }; Body?: { weekStart?: string } }>(
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
          result = await importTemplateFromSheet(s.spreadsheetId);
        } else {
          const weekStart = String(req.body?.weekStart ?? '').trim();
          if (!weekStart) return reply.code(400).send({ error: 'weekStart обязателен для schedule (YYYY-MM-DD, понедельник)' });
          result = await importScheduleFromSheet(s.spreadsheetId, weekStart);
        }
        const summary = summariseResult(result);
        await db.sheetsSync.update({ where: { id }, data: { lastRunAt: new Date(), lastResult: `Импорт: ${summary}` } });
        return { ok: true, result };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.sheetsSync.update({ where: { id }, data: { lastRunAt: new Date(), lastResult: `Ошибка импорта: ${msg}` } }).catch(() => {});
        return reply.code(500).send({ error: msg });
      }
    },
  );

  app.post<{ Params: { id: string }; Body?: { weekStart?: string } }>(
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
          result = await exportTemplateToSheet(s.spreadsheetId);
        } else {
          const weekStart = String(req.body?.weekStart ?? '').trim();
          if (!weekStart) return reply.code(400).send({ error: 'weekStart обязателен для schedule (YYYY-MM-DD, понедельник)' });
          result = await exportScheduleToSheet(s.spreadsheetId, weekStart);
        }
        const summary = summariseResult(result);
        await db.sheetsSync.update({ where: { id }, data: { lastRunAt: new Date(), lastResult: `Экспорт: ${summary}` } });
        return { ok: true, result };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await db.sheetsSync.update({ where: { id }, data: { lastRunAt: new Date(), lastResult: `Ошибка экспорта: ${msg}` } }).catch(() => {});
        return reply.code(500).send({ error: msg });
      }
    },
  );
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
