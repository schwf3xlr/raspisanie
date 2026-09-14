import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from './config.js';
import { db } from './db.js';

const COOKIE = 'sid';

export type Role = 'school' | 'tech';
export interface CurrentAdmin {
  id: number;
  login: string;
  role: Role;
  displayName: string | null;
}

// Хеширует пароль. bcrypt cost 10 — быстро и достаточно.
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

// Ищет пользователя по логину и проверяет пароль. Возвращает пользователя или null.
export async function verifyCredentials(login: string, password: string): Promise<CurrentAdmin | null> {
  if (!login || !password) return null;
  const user = await db.adminUser.findUnique({ where: { login } });
  if (!user) {
    // Постоянное время: гоняем bcrypt чтобы не давать time-side-channel «логин не найден».
    await bcrypt.compare(password, '$2b$10$abcdefghijklmnopqrstuv');
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash).catch(() => false);
  if (!ok) return null;
  return { id: user.id, login: user.login, role: user.role as Role, displayName: user.displayName };
}

export async function createSession(reply: FastifyReply, userId: number): Promise<string> {
  const id = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + config.sessionTtlDays * 24 * 60 * 60 * 1000);
  await db.adminSession.create({ data: { id, expiresAt, userId } });
  const isProd = process.env.NODE_ENV === 'production';
  reply.setCookie(COOKIE, id, {
    path: '/',
    httpOnly: true,
    // В проде фронтенд может быть в Capacitor WebView (cross-origin к API) -
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

// Возвращает текущего админа или null. Больше НЕ работает без AdminUser.
export async function getCurrentAdmin(req: FastifyRequest): Promise<CurrentAdmin | null> {
  const sid = req.cookies?.[COOKIE];
  if (!sid) return null;
  try {
    const s = await db.adminSession.findUnique({ where: { id: sid }, include: { user: true } });
    if (!s) return null;
    if (s.expiresAt.getTime() < Date.now()) {
      await db.adminSession.delete({ where: { id: sid } }).catch(() => {});
      return null;
    }
    if (!s.user) return null;
    return { id: s.user.id, login: s.user.login, role: s.user.role as Role, displayName: s.user.displayName };
  } catch {
    return null;
  }
}

export async function isAuthenticated(req: FastifyRequest): Promise<boolean> {
  return (await getCurrentAdmin(req)) !== null;
}

// Для preHandler: любой авторизованный админ.
export async function requireAdmin(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const me = await getCurrentAdmin(req);
  if (!me) {
    reply.code(401).send({ error: 'Требуется вход администратора' });
    return Promise.reject(new Error('unauthorized'));
  }
  (req as FastifyRequest & { admin?: CurrentAdmin }).admin = me;
}

// Для preHandler: только техадмин.
export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const me = await getCurrentAdmin(req);
    if (!me) {
      reply.code(401).send({ error: 'Требуется вход администратора' });
      return Promise.reject(new Error('unauthorized'));
    }
    if (!roles.includes(me.role)) {
      reply.code(403).send({ error: 'Недостаточно прав' });
      return Promise.reject(new Error('forbidden'));
    }
    (req as FastifyRequest & { admin?: CurrentAdmin }).admin = me;
  };
}

export async function cleanupExpiredSessions(): Promise<void> {
  try {
    await db.adminSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  } catch {
    /* table may not exist yet */
  }
}

// При первом запуске создаём одного tech-админа из .env.
export async function ensureInitialAdmin(): Promise<{ created: boolean; login: string } | null> {
  const count = await db.adminUser.count();
  if (count > 0) return null;
  const login = config.adminLogin || 'admin';
  const password = config.adminPassword || 'admin';
  const passwordHash = await hashPassword(password);
  await db.adminUser.create({
    data: { login, passwordHash, role: 'tech', displayName: 'Технический администратор' },
  });
  return { created: true, login };
}
