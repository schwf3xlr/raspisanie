import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { db } from './db.js';

const COOKIE = 'sid';

function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function checkCredentials(login: string, password: string): boolean {
  return safeEq(login, config.adminLogin) && safeEq(password, config.adminPassword);
}

export async function createSession(reply: FastifyReply): Promise<string> {
  const id = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  await db.adminSession.create({ data: { id, expiresAt } });
  const isProd = process.env.NODE_ENV === 'production';
  reply.setCookie(COOKIE, id, {
    path: '/',
    httpOnly: true,
    // В проде фронтенд может быть в Capacitor WebView (cross-origin к API) —
    // тогда для отправки cookie обязательно SameSite=None; Secure.
    sameSite: isProd ? 'none' : 'lax',
    secure: isProd,
    expires: expiresAt,
  });
  return id;
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sid = req.cookies?.[COOKIE];
  if (sid) {
    await db.adminSession.deleteMany({ where: { id: sid } }).catch(() => {});
  }
  reply.clearCookie(COOKIE, { path: '/' });
}

export async function isAuthenticated(req: FastifyRequest): Promise<boolean> {
  const sid = req.cookies?.[COOKIE];
  if (!sid) return false;
  try {
    const s = await db.adminSession.findUnique({ where: { id: sid } });
    if (!s) return false;
    if (s.expiresAt.getTime() < Date.now()) {
      await db.adminSession.delete({ where: { id: sid } }).catch(() => {});
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  return isAuthenticated(req).then(ok => {
    if (!ok) {
      reply.code(401).send({ error: 'Требуется вход администратора' });
      return Promise.reject(new Error('unauthorized'));
    }
  });
}

export async function cleanupExpiredSessions(): Promise<void> {
  try {
    await db.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch {
    /* table may not exist yet */
  }
}
