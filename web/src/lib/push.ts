import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';
import { api } from './api';
import type { SavedViewer } from './types';

// Модуль работает только на нативной платформе Android/iOS. В браузере - no-op.

const TOKEN_KEY = 'push_token';
const LAST_VIEWER_KEY = 'push_last_viewer';
const PREFS_KEY = 'notif_prefs';

export type NotifKind = 'publish' | 'changes' | 'distant' | 'manual';
export interface NotifPrefs {
  publish: boolean;
  changes: boolean;
  distant: boolean;
  manual: boolean;
}

const DEFAULT_PREFS: NotifPrefs = { publish: true, changes: true, distant: true, manual: true };

export function getNotifPrefs(): NotifPrefs {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = JSON.parse(raw) as Partial<NotifPrefs>;
    return {
      publish: typeof parsed.publish === 'boolean' ? parsed.publish : true,
      changes: typeof parsed.changes === 'boolean' ? parsed.changes : true,
      distant: typeof parsed.distant === 'boolean' ? parsed.distant : true,
      manual:  typeof parsed.manual  === 'boolean' ? parsed.manual  : true,
    };
  } catch { return { ...DEFAULT_PREFS }; }
}

function saveNotifPrefsLocal(p: NotifPrefs): void {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

// Сохранить настройки локально и отправить на бэкенд. Если токена ещё нет -
// он подхватится при следующей регистрации (см. registration listener).
export async function updateNotifPrefs(next: NotifPrefs, viewer: import('./types').SavedViewer | null): Promise<void> {
  saveNotifPrefsLocal(next);
  if (!isPushSupported()) return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return;
  try {
    await registerToken(token, viewer);
    console.log('[push] настройки уведомлений синхронизированы:', next);
  } catch (err) {
    console.error('[push] updateNotifPrefs failed:', err);
  }
}

interface RegistrationOpts {
  viewer: SavedViewer | null;
  onNotificationTap?: (data: Record<string, string>) => void;
}

let initialised = false;

export function isPushSupported(): boolean {
  return Capacitor.isNativePlatform();
}

// Один раз при старте приложения. Идемпотентно.
export async function initPush({ viewer, onNotificationTap }: RegistrationOpts): Promise<void> {
  if (initialised) return;
  if (!isPushSupported()) return;
  initialised = true;

  try {
    const perm = await PushNotifications.checkPermissions();
    let receive = perm.receive;
    if (receive === 'prompt' || receive === 'prompt-with-rationale') {
      const req = await PushNotifications.requestPermissions();
      receive = req.receive;
    }
    if (receive !== 'granted') {
      console.warn('[push] Разрешение не выдано:', receive);
      return;
    }

    PushNotifications.addListener('registration', async token => {
      console.log('[push] token получен, длина =', token.value.length);
      try {
        localStorage.setItem(TOKEN_KEY, token.value);
        await registerToken(token.value, viewer);
      } catch (err) {
        console.error('[push] register failed:', err);
      }
    });

    PushNotifications.addListener('registrationError', err => {
      console.error('[push] FCM registrationError:', err);
    });

    PushNotifications.addListener('pushNotificationReceived', notification => {
      // Foreground-уведомление. Android по умолчанию НЕ показывает системный алерт в foreground -
      // просто логируем; ученик увидит новое расписание при следующем открытии.
      console.log('[push] получено в foreground:', notification.title, notification.body);
    });

    PushNotifications.addListener('pushNotificationActionPerformed', action => {
      const data = (action.notification.data ?? {}) as Record<string, string>;
      console.log('[push] клик по уведомлению, data:', data);
      onNotificationTap?.(data);
    });

    await PushNotifications.register();
  } catch (err) {
    console.error('[push] init failed:', err);
  }
}

// Вызывается когда пользователь сменил класс / стал учителем.
export async function syncViewer(viewer: SavedViewer | null): Promise<void> {
  if (!isPushSupported()) return;
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return; // токен ещё не получен - придёт через registration listener

  const prev = localStorage.getItem(LAST_VIEWER_KEY);
  const nextKey = viewerKey(viewer);
  if (prev === nextKey) return;

  try {
    await registerToken(token, viewer);
  } catch (err) {
    console.error('[push] syncViewer failed:', err);
  }
}

async function registerToken(token: string, viewer: SavedViewer | null): Promise<void> {
  const opts = {
    platform: 'android',
    className: viewer?.mode === 'class' ? (viewer.className ?? null) : null,
    teacherId: viewer?.mode === 'teacher' ? (viewer.teacherId ?? null) : null,
    notifPrefs: getNotifPrefs(),
  };
  await api.pushRegister(token, opts);
  localStorage.setItem(LAST_VIEWER_KEY, viewerKey(viewer));
  console.log('[push] токен зарегистрирован, подписка:', opts);
}

function viewerKey(v: SavedViewer | null): string {
  if (!v) return 'none';
  if (v.mode === 'teacher') return `t:${v.teacherId ?? ''}`;
  return `c:${v.className ?? ''}`;
}
