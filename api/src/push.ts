import { readFileSync, existsSync } from 'node:fs';
import { JWT } from 'google-auth-library';
import { db } from './db.js';

// Конфигурация FCM. Если сервисный аккаунт не прописан — модуль работает как no-op.
// Ключ берём из FCM_SERVICE_ACCOUNT_JSON (сам JSON в env) или FCM_SERVICE_ACCOUNT_FILE (путь к файлу).

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function loadServiceAccount(): ServiceAccount | null {
  const inline = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (inline) {
    try {
      return JSON.parse(inline) as ServiceAccount;
    } catch (err) {
      console.error('[push] FCM_SERVICE_ACCOUNT_JSON — не валидный JSON:', err);
      return null;
    }
  }
  const file = process.env.FCM_SERVICE_ACCOUNT_FILE?.trim();
  if (file && existsSync(file)) {
    try {
      return JSON.parse(readFileSync(file, 'utf8')) as ServiceAccount;
    } catch (err) {
      console.error(`[push] Не удалось прочитать ${file}:`, err);
      return null;
    }
  }
  return null;
}

const sa = loadServiceAccount();
const jwt = sa
  ? new JWT({
      email: sa.client_email,
      key: sa.private_key,
      scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
    })
  : null;

export const pushConfigured = sa !== null;

if (!pushConfigured) {
  console.warn('[push] FCM не сконфигурирован — уведомления отключены. Задайте FCM_SERVICE_ACCOUNT_JSON или FCM_SERVICE_ACCOUNT_FILE.');
} else {
  console.log(`[push] FCM активен, project=${sa!.project_id}`);
}

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}

// Отправка одному токену. Возвращает { ok } или { ok: false, invalid } — invalid = токен пора удалить.
async function sendOne(token: string, payload: PushPayload): Promise<{ ok: boolean; invalid?: boolean; error?: string }> {
  if (!sa || !jwt) return { ok: false, error: 'not-configured' };
  const accessToken = await jwt.getAccessToken();
  if (!accessToken?.token) return { ok: false, error: 'no-access-token' };

  const url = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;
  const message = {
    message: {
      token,
      notification: {
        title: payload.title,
        body: payload.body,
      },
      data: payload.data ?? {},
      android: {
        priority: 'HIGH' as const,
        notification: {
          channel_id: 'schedule',
          // click_action НЕ задаём: Capacitor push-plugin обрабатывает клик через дефолтный
          // launcher-intent - открывает MAIN activity нашего приложения и триггерит
          // pushNotificationActionPerformed на клиенте. Кастомный action ломает клик,
          // потому что такого intent-filter в манифесте нет.
        },
      },
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(message),
  });

  if (res.ok) return { ok: true };

  const text = await res.text().catch(() => '');
  // 404 UNREGISTERED / 400 INVALID_ARGUMENT для битых токенов → чистим
  const invalid = res.status === 404 || /UNREGISTERED|INVALID_ARGUMENT/.test(text);
  return { ok: false, invalid, error: `${res.status} ${text.slice(0, 200)}` };
}

interface Target {
  className?: string;
  teacherId?: number;
  broadcast?: boolean; // всем зарегистрированным
}

// Тип уведомления - определяет, кому уведомление разрешено настройками устройства.
export type NotifKind = 'publish' | 'changes' | 'distant' | 'manual';

// Настройки уведомлений на устройстве. По умолчанию (null) - все включены.
export interface NotifPrefs {
  publish?: boolean;   // публикация нового расписания
  changes?: boolean;   // изменения в опубликованном (отмены, замены, изменение звонков)
  distant?: boolean;   // дистанционный день
  manual?: boolean;    // ручные рассылки от админа («6 урок отменён» и т.п.)
}

function isKindAllowed(prefsJson: unknown, kind: NotifKind): boolean {
  // Старые токены без prefs = все включено.
  if (prefsJson == null) return true;
  const p = prefsJson as Record<string, unknown>;
  const v = p[kind];
  // Явное false = выключено; всё остальное (true, undefined, null) = включено.
  return v !== false;
}

export interface PushResult {
  attempted: number;   // Сколько устройств теоретически получили бы (подписаны + kind разрешён).
  succeeded: number;
  cleaned: number;
  skipped: number;     // Отфильтрованы настройками устройства.
}

export async function sendPush(target: Target, payload: PushPayload, opts: { kind: NotifKind }): Promise<PushResult> {
  if (!pushConfigured) return { attempted: 0, succeeded: 0, cleaned: 0, skipped: 0 };

  const where = target.broadcast
    ? {}
    : target.className
      ? { className: target.className }
      : target.teacherId
        ? { teacherId: target.teacherId }
        : null;

  if (!where) return { attempted: 0, succeeded: 0, cleaned: 0, skipped: 0 };

  const rows = await db.deviceToken.findMany({ where });
  const eligible = rows.filter(r => isKindAllowed(r.notifPrefs, opts.kind));
  const skipped = rows.length - eligible.length;

  let succeeded = 0;
  const invalidIds: number[] = [];

  // Обогащаем data.kind - клиент может использовать при обработке.
  const finalPayload: PushPayload = {
    ...payload,
    data: { ...(payload.data ?? {}), kind: opts.kind },
  };

  await Promise.all(
    eligible.map(async row => {
      try {
        const r = await sendOne(row.token, finalPayload);
        if (r.ok) succeeded++;
        else if (r.invalid) invalidIds.push(row.id);
      } catch (err) {
        console.error(`[push] сбой отправки id=${row.id}:`, err);
      }
    }),
  );

  if (invalidIds.length > 0) {
    await db.deviceToken.deleteMany({ where: { id: { in: invalidIds } } });
  }

  return { attempted: eligible.length, succeeded, cleaned: invalidIds.length, skipped };
}
