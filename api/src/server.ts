import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import { config } from './config.js';
import { registerRoutes } from './routes.js';
import { registerAdminRoutes } from './routes-admin.js';
import { cleanupExpiredSessions, ensureInitialAdmin } from './auth.js';
import { resortClassesIfNeeded, seedIfEmpty } from './seed.js';
import { db } from './db.js';

const app = Fastify({ logger: true });

// В Capacitor Android WebView origin = "https://localhost". Разрешаем его и любые школьные домены.
await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (origin === 'https://localhost' || origin === 'capacitor://localhost') return cb(null, true);
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return cb(null, true);
    if (/\.rskbot\.ru$/.test(new URL(origin).hostname)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
});

await app.register(cookie, {
  secret: config.sessionSecret,
});

await registerRoutes(app);
await registerAdminRoutes(app);

try {
  const s = await seedIfEmpty();
  if (s.seeded) {
    app.log.info(`Первый запуск - засеяно ${s.classes} классов, ${s.lessons} уроков.`);
  } else {
    app.log.info(`В БД ${s.classes} классов, ${s.lessons} уроков.`);
  }
  const r = await resortClassesIfNeeded();
  if (r.updated > 0) {
    app.log.info(`Пересчитан порядок классов: обновлено ${r.updated} из ${r.total}.`);
  }
  const admin = await ensureInitialAdmin();
  if (admin?.created) {
    app.log.info(`Создан первый tech-администратор: логин "${admin.login}" (пароль - из ADMIN_PASSWORD в .env).`);
  }
} catch (err) {
  app.log.error({ err }, 'Ошибка при seed/resort/admin-bootstrap');
}

const cleanupInterval = setInterval(() => {
  cleanupExpiredSessions().catch(() => {});
}, 15 * 60 * 1000);

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info('Админов теперь можно заводить прямо в панели управления (роль tech).');
} catch (err) {
  app.log.error(err);
  process.exit(1);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} — останавливаемся…`);
    clearInterval(cleanupInterval);
    await app.close();
    await db.$disconnect();
    process.exit(0);
  });
}
