import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { confirmDialog } from './dialog';

const MANIFEST_URL = (import.meta.env.VITE_API_BASE ?? '') + '/downloads/latest.json';

interface Manifest {
  versionCode: number;
  versionName: string;
  apkUrl: string;
  mandatory?: boolean;
  changelog?: string;
}

export interface UpdateCheckResult {
  status: 'not-native' | 'up-to-date' | 'error' | 'offered';
  current?: string;
  latest?: Manifest;
  error?: string;
}

// Запускается при каждом старте приложения и при ручном нажатии «Проверить обновление» из настроек.
// Работает только в Capacitor (Android APK); в браузере возвращает 'not-native'.
//
// Опция `silent`:
//   true  - авто-запуск: молча уходит, если обновления нет или манифест недоступен.
//   false - ручной запуск: покажет toast/alert о том, что установлена последняя версия.
export async function checkForUpdate(opts: { silent?: boolean } = {}): Promise<UpdateCheckResult> {
  const silent = opts.silent ?? true;
  if (!Capacitor.isNativePlatform()) return { status: 'not-native' };

  const log = (...args: unknown[]) => console.log('[update-check]', ...args);

  try {
    const info = await App.getInfo();
    const currentCode = Number(info.build) || 0;
    log('current version:', info.version, 'build:', info.build, `-> manifest URL: ${MANIFEST_URL}`);

    const res = await fetch(MANIFEST_URL, { cache: 'no-cache' });
    if (!res.ok) {
      log('manifest fetch failed:', res.status, res.statusText);
      return { status: 'error', error: `${res.status} ${res.statusText}` };
    }
    const m = (await res.json()) as Manifest;
    log('manifest:', m);

    if (!m?.versionCode || !m.apkUrl) {
      return { status: 'error', error: 'manifest missing versionCode or apkUrl' };
    }
    if (m.versionCode <= currentCode) {
      log('already up-to-date');
      return { status: 'up-to-date', current: info.version, latest: m };
    }

    // Показываем короткое приглашение вместо всего changelog'а.
    // Полный список изменений живёт на отдельной странице /changelog.
    const message = `Доступна новая версия приложения. Список изменений — на странице «История обновлений».`;

    const ok = await confirmDialog({
      title: `Обновление · ${m.versionName}`,
      message,
      confirmText: 'Обновить сейчас',
      cancelText: 'Позже',
      banner: m.mandatory
        ? { kind: 'critical', text: 'Критически важное обновление' }
        : undefined,
    });

    if (ok) {
      // Открываем ссылку на APK во внешнем браузере / в системном download-менеджере.
      // Android скачает файл, потом пользователь нажмёт «Установить».
      window.open(m.apkUrl, '_blank');
    }
    // «Позже» больше НЕ запоминается: при следующем входе спросим снова.
    return { status: 'offered', current: info.version, latest: m };
  } catch (err) {
    if (!silent) throw err;
    console.warn('[update-check] failed', err);
    return { status: 'error', error: err instanceof Error ? err.message : String(err) };
  }
}
