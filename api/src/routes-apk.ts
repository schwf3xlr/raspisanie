import { promises as fs } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { config } from './config.js';
import { requireRole } from './auth.js';

const MANIFEST_NAME = 'latest.json';
const CHANGELOG_NAME = 'changelog.json';
const APK_MAX_BYTES = 100 * 1024 * 1024; // 100 МБ - c запасом
// Только .apk файлы с безопасными именами: буквы, цифры, точка, дефис, подчёркивание.
const SAFE_NAME_RE = /^[A-Za-z0-9._-]+\.apk$/;

interface Manifest {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  changelog?: string;
  mandatory?: boolean;
  updatedAt?: string;
}

interface ChangelogEntry {
  versionCode: number;
  versionName: string;
  publishedAt: string;   // ISO
  changelog: string;
  mandatory: boolean;
}

function assertConfigured(): string {
  if (!config.apkDir) {
    const err = new Error('APK_DIR не задан в .env бэкенда') as Error & { statusCode?: number };
    err.statusCode = 503;
    throw err;
  }
  return config.apkDir;
}

async function readManifest(dir: string): Promise<Manifest | null> {
  try {
    const raw = await fs.readFile(path.join(dir, MANIFEST_NAME), 'utf8');
    return JSON.parse(raw) as Manifest;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function writeManifest(dir: string, m: Manifest): Promise<void> {
  const payload: Manifest = { ...m, updatedAt: new Date().toISOString() };
  await fs.writeFile(path.join(dir, MANIFEST_NAME), JSON.stringify(payload, null, 2) + '\n', 'utf8');
}

async function readChangelog(dir: string): Promise<ChangelogEntry[]> {
  try {
    const raw = await fs.readFile(path.join(dir, CHANGELOG_NAME), 'utf8');
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(e => e && typeof e.versionCode === 'number' && typeof e.versionName === 'string');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
}

async function writeChangelog(dir: string, list: ChangelogEntry[]): Promise<void> {
  // Отсортируем от новых к старым.
  const sorted = [...list].sort((a, b) => b.versionCode - a.versionCode);
  await fs.writeFile(path.join(dir, CHANGELOG_NAME), JSON.stringify(sorted, null, 2) + '\n', 'utf8');
}

// Добавляет / обновляет запись в changelog для конкретной версии.
async function upsertChangelogEntry(dir: string, entry: ChangelogEntry): Promise<void> {
  const list = await readChangelog(dir);
  const idx = list.findIndex(e => e.versionCode === entry.versionCode);
  if (idx >= 0) list[idx] = entry;
  else list.push(entry);
  await writeChangelog(dir, list);
}

interface ApkFileInfo {
  name: string;
  size: number;
  updatedAt: string;
  url: string;
}

async function listApkFiles(dir: string): Promise<ApkFileInfo[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files: ApkFileInfo[] = [];
  for (const e of entries) {
    if (!e.isFile() || !e.name.toLowerCase().endsWith('.apk')) continue;
    const full = path.join(dir, e.name);
    const st = await fs.stat(full).catch(() => null);
    if (!st) continue;
    files.push({
      name: e.name,
      size: st.size,
      updatedAt: st.mtime.toISOString(),
      url: `${config.apkPublicBase}/${encodeURIComponent(e.name)}`,
    });
  }
  files.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return files;
}

export async function registerApkRoutes(app: FastifyInstance) {
  // Общий статус: сконфигурирован ли APK-модуль, что лежит в директории, текущий manifest.
  app.get(
    '/api/admin/apk/status',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async () => {
      if (!config.apkDir) {
        return { configured: false, apkDir: null, publicBase: config.apkPublicBase, manifest: null, files: [] as ApkFileInfo[] };
      }
      // Убедимся, что директория есть и доступна.
      let dirOk = true;
      try { await fs.access(config.apkDir); } catch { dirOk = false; }
      if (!dirOk) {
        return { configured: true, apkDir: config.apkDir, publicBase: config.apkPublicBase, error: 'Директория не найдена или нет доступа', manifest: null, files: [] as ApkFileInfo[] };
      }
      const [manifest, files] = await Promise.all([readManifest(config.apkDir), listApkFiles(config.apkDir)]);
      return { configured: true, apkDir: config.apkDir, publicBase: config.apkPublicBase, manifest, files };
    },
  );

  // Загрузка APK. multipart/form-data: поле "file".
  // Опционально: query ?name=… - иначе используется originalName.
  app.post<{ Querystring: { name?: string } }>(
    '/api/admin/apk/upload',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async (req, reply) => {
      const dir = assertConfigured();
      // @fastify/multipart добавляет req.file()
      type MultipartPart = { file: Readable; filename: string; mimetype: string };
      const part = await (req as unknown as { file: () => Promise<MultipartPart | undefined> }).file();
      if (!part) return reply.code(400).send({ error: 'файл не передан (поле file)' });

      const requested = (req.query?.name?.trim() || part.filename || '').trim();
      if (!requested) return reply.code(400).send({ error: 'нет имени файла' });
      const finalName = requested.toLowerCase().endsWith('.apk') ? requested : `${requested}.apk`;
      if (!SAFE_NAME_RE.test(finalName)) {
        return reply.code(400).send({ error: 'Имя файла: только латиница, цифры, точка, дефис, подчёркивание, окончание .apk' });
      }

      const target = path.join(dir, finalName);

      // Пишем во временный файл, потом переименовываем - чтобы прерванная загрузка не оставила битый APK.
      const tmp = target + '.uploading';
      let written = 0;
      const out = createWriteStream(tmp);
      // Контроль размера
      part.file.on('data', (chunk: Buffer) => {
        written += chunk.length;
        if (written > APK_MAX_BYTES) {
          part.file.destroy(new Error('слишком большой файл'));
          out.destroy();
        }
      });
      try {
        await pipeline(part.file, out);
      } catch (err) {
        await fs.unlink(tmp).catch(() => {});
        return reply.code(400).send({ error: (err as Error).message || 'ошибка загрузки' });
      }
      await fs.rename(tmp, target);

      const st = await fs.stat(target);
      const info: ApkFileInfo = {
        name: finalName,
        size: st.size,
        updatedAt: st.mtime.toISOString(),
        url: `${config.apkPublicBase}/${encodeURIComponent(finalName)}`,
      };
      return { ok: true, file: info };
    },
  );

  app.delete<{ Params: { name: string } }>(
    '/api/admin/apk/file/:name',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async (req, reply) => {
      const dir = assertConfigured();
      const name = req.params.name;
      if (!SAFE_NAME_RE.test(name)) return reply.code(400).send({ error: 'некорректное имя' });
      await fs.unlink(path.join(dir, name)).catch(() => {});
      return { ok: true };
    },
  );

  // Публикация / редактирование latest.json.
  // Автоматически добавляет / обновляет запись в changelog.json.
  app.put<{ Body: Partial<Manifest> }>(
    '/api/admin/apk/manifest',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async (req, reply) => {
      const dir = assertConfigured();
      const b = req.body ?? {};
      const versionCode = Number(b.versionCode);
      const versionName = String(b.versionName ?? '').trim();
      const apkUrl = String(b.apkUrl ?? '').trim();
      if (!Number.isFinite(versionCode) || versionCode <= 0) return reply.code(400).send({ error: 'versionCode: положительное число' });
      if (!versionName) return reply.code(400).send({ error: 'versionName обязателен' });
      if (!apkUrl) return reply.code(400).send({ error: 'apkUrl обязателен' });
      const changelog = typeof b.changelog === 'string' ? b.changelog : '';
      const mandatory = !!b.mandatory;
      const m: Manifest = { versionCode, versionName, apkUrl, changelog: changelog || undefined, mandatory };
      await writeManifest(dir, m);
      // Auto-upsert в changelog
      await upsertChangelogEntry(dir, {
        versionCode,
        versionName,
        publishedAt: new Date().toISOString(),
        changelog,
        mandatory,
      });
      const written = await readManifest(dir);
      return { ok: true, manifest: written };
    },
  );

  app.delete(
    '/api/admin/apk/manifest',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async () => {
      const dir = assertConfigured();
      await fs.unlink(path.join(dir, MANIFEST_NAME)).catch(() => {});
      return { ok: true };
    },
  );

  // ---------- Changelog ----------
  // Публичный список версий.
  app.get('/api/changelog', async () => {
    if (!config.apkDir) return { entries: [] as ChangelogEntry[] };
    const list = await readChangelog(config.apkDir).catch(() => []);
    return { entries: list };
  });

  // Управление (только tech).
  app.get(
    '/api/admin/changelog',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async () => {
      const dir = assertConfigured();
      return { entries: await readChangelog(dir) };
    },
  );

  // Полностью заменить список (например, переставить порядок или отредактировать текст).
  app.put<{ Body: { entries: ChangelogEntry[] } }>(
    '/api/admin/changelog',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async (req, reply) => {
      const dir = assertConfigured();
      const entries = req.body?.entries;
      if (!Array.isArray(entries)) return reply.code(400).send({ error: 'entries: массив' });
      const clean: ChangelogEntry[] = [];
      for (const e of entries) {
        if (!e || typeof e.versionCode !== 'number' || !e.versionName) continue;
        clean.push({
          versionCode: Number(e.versionCode),
          versionName: String(e.versionName),
          publishedAt: typeof e.publishedAt === 'string' ? e.publishedAt : new Date().toISOString(),
          changelog: typeof e.changelog === 'string' ? e.changelog : '',
          mandatory: !!e.mandatory,
        });
      }
      await writeChangelog(dir, clean);
      return { ok: true, entries: await readChangelog(dir) };
    },
  );

  app.delete<{ Params: { versionCode: string } }>(
    '/api/admin/changelog/:versionCode',
    { preHandler: (req, reply) => requireRole('tech')(req, reply) },
    async (req, reply) => {
      const dir = assertConfigured();
      const vc = Number(req.params.versionCode);
      if (!Number.isFinite(vc)) return reply.code(400).send({ error: 'bad versionCode' });
      const list = await readChangelog(dir);
      await writeChangelog(dir, list.filter(e => e.versionCode !== vc));
      return { ok: true };
    },
  );
}
