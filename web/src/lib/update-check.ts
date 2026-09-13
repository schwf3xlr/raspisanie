import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { confirmDialog } from './dialog';

const MANIFEST_URL = (import.meta.env.VITE_API_BASE ?? '') + '/downloads/latest.json';
const DISMISS_KEY = 'update-dismissed-version';

interface Manifest {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  mandatory?: boolean;
  changelog?: string;
}

// Запускается один раз при старте приложения. Работает только в Capacitor (Android APK),
// в браузере ничего не делает.
export async function checkForUpdate(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const info = await App.getInfo();
    const currentCode = Number(info.build) || 0;

    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!res.ok) return;
    const m = (await res.json()) as Manifest;

    if (!m?.versionCode || !m.apkUrl) return;
    if (m.versionCode <= currentCode) return;

    // Если пользователь уже отклонил именно эту версию — не спрашиваем снова,
    // пока не выйдет ещё более новая.
    if (!m.mandatory) {
      const dismissed = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
      if (m.versionCode <= dismissed) return;
    }

    const changelog = m.changelog?.trim() || 'Появилась новая версия приложения.';

    const ok = await confirmDialog({
      title: m.mandatory
        ? `Обновление обязательно · ${m.versionName}`
        : `Обновление · ${m.versionName}`,
      message: changelog,
      confirmText: 'Обновить сейчас',
      cancelText: m.mandatory ? 'Отмена' : 'Позже',
    });

    if (ok) {
      // Открываем ссылку на APK во внешнем браузере / в системном download-менеджере.
      // Android скачает файл, потом пользователь нажмёт «Установить».
      window.open(m.apkUrl, '_blank');
    } else if (!m.mandatory) {
      localStorage.setItem(DISMISS_KEY, String(m.versionCode));
    }
  } catch (err) {
    // Тихо — обновление не должно ломать запуск приложения.
    // eslint-disable-next-line no-console
    console.warn('[update-check] failed', err);
  }
}
