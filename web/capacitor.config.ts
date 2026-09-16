import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ru.school44omsk.raspisanie',
  appName: 'Расписание СОШ №44',
  webDir: 'dist',
  android: {
    allowMixedContent: false,
    backgroundColor: '#0d0d0e',
  },
  server: {
    // Все API-запросы идут абсолютным URL на school.rskbot.ru,
    // сам React бандлится в APK. Cookies работают благодаря secure-контексту (androidScheme = https).
    androidScheme: 'https',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: '#0d0d0e',
      showSpinner: false,
      androidSplashResourceName: 'splash',
    },
    PushNotifications: {
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
