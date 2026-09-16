import 'dotenv/config';

const DAYS = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница'] as const;
export type DayName = typeof DAYS[number];

export const SCHOOL = {
  short: 'СОШ №44',
  full: 'БОУ г. Омска «СОШ № 44 им. А.В. Салугина»',
  city: 'Омск',
};

export const config = {
  port: Number(process.env.PORT) || 3001,

  adminLogin: process.env.ADMIN_LOGIN || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  sessionSecret: process.env.SESSION_SECRET || 'change-me-in-env-please',
  sessionTtlDays: 7,

  days: DAYS,

  // Директория, в которую Caddy раздаёт APK и latest.json.
  // На VPS обычно /var/www/downloads. В dev без переменной - функционал управления APK отключён.
  apkDir: process.env.APK_DIR || '',
  // Публичный URL, по которому файлы из APK_DIR доступны снаружи.
  apkPublicBase: process.env.APK_PUBLIC_BASE || 'https://school.rskbot.ru/downloads',

  // Сервисный аккаунт Google. Используется и для Sheets, и для FCM (можно один и тот же).
  // Sheets-модуль читает GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON/FILE; если не задан -
  // fallback на FCM_SERVICE_ACCOUNT_*.
  sheetsSaJson: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON || process.env.FCM_SERVICE_ACCOUNT_JSON || '',
  sheetsSaFile: process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_FILE || process.env.FCM_SERVICE_ACCOUNT_FILE || '',
};

export const DEFAULT_TIME_SLOTS: Array<{ number: number; timeStart: string; timeEnd: string }> = [
  { number: 1, timeStart: '8:10',  timeEnd: '8:50'  },
  { number: 2, timeStart: '9:00',  timeEnd: '9:40'  },
  { number: 3, timeStart: '9:50',  timeEnd: '10:30' },
  { number: 4, timeStart: '10:40', timeEnd: '11:20' },
  { number: 5, timeStart: '11:40', timeEnd: '12:20' },
  { number: 6, timeStart: '12:30', timeEnd: '13:10' },
  { number: 7, timeStart: '13:20', timeEnd: '14:00' },
  { number: 8, timeStart: '14:05', timeEnd: '14:45' },
];
