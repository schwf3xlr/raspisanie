# Сборка Android-приложения

Приложение построено на **Capacitor** — React-код из `web/` работает как есть, но упакован в нативный APK.

- **App ID:** `ru.rskbot.school44.raspisanie`
- **Название:** «Расписание СОШ №44»
- **Domain:** `https://school.rskbot.ru` (задан в `web/.env.android`)

---

## 1. Установить Android Studio (один раз)

1. Скачать: <https://developer.android.com/studio>
2. Установить со всеми галочками по умолчанию.
3. При первом запуске Studio предложит скачать SDK — согласиться.
4. Убедиться, что установлен **JDK 17** (Studio обычно ставит свой; вручную не надо).
5. **Проверить:** в терминале должна работать команда `sdkmanager --version`. Если нет — добавить в PATH:
   - `C:\Users\<ты>\AppData\Local\Android\Sdk\platform-tools`
   - `C:\Users\<ты>\AppData\Local\Android\Sdk\cmdline-tools\latest\bin`

---

## 2. Первичная инициализация Android-проекта (один раз)

Из корня папки `web/`:

```bash
cd web
npm install
npx cap add android
```

Это создаст папку `web/android/` — типовой Android-проект. Внутри всё, что нужно для сборки APK.

Затем сгенерировать иконки из эмблемы:

```bash
npm run icons
```

---

## 3. Собрать debug-APK

```bash
cd web
npm run build:android
npm run open:android
```

`npm run build:android` собирает React в `web/dist`, копирует его в `web/android/app/src/main/assets/public` и синхронизирует. `open:android` открывает проект в Android Studio.

В Android Studio: **Build → Build Bundle(s) / APK(s) → Build APK(s)**.
Через минуту в правом нижнем углу появится ссылка «locate»: [web/android/app/build/outputs/apk/debug/app-debug.apk](web/android/app/build/outputs/apk/debug/app-debug.apk).

Или из командной строки без Studio:
```bash
cd web/android
./gradlew.bat assembleDebug
```

APK будет в `web/android/app/build/outputs/apk/debug/app-debug.apk` — ~ 5-10 МБ.

---

## 4. Установить APK на телефон (для теста)

Способ 1 — по кабелю:
1. Включить в Android «Отладка по USB» (Настройки → Об устройстве → тапать 7 раз по «Номер сборки» → включится режим разработчика → в «Для разработчиков» включить «Отладка по USB»).
2. Подключить телефон.
3. `adb install web/android/app/build/outputs/apk/debug/app-debug.apk`

Способ 2 — простой:
1. Загрузить APK на телефон (Telegram себе, Bluetooth, что угодно).
2. Открыть файл, Android спросит «Разрешить установку из этого источника» — разрешить.
3. Установить.

---

## 5. Release APK (когда сайт уже на VPS)

Чтобы поставить приложение обычным ученикам — нужен подписанный release APK.

### 5.1 Один раз: сгенерировать keystore

```bash
cd web/android/app
keytool -genkey -v -keystore school-release.keystore -alias school -keyalg RSA -keysize 2048 -validity 10000
```

Ответить на вопросы (имя, организация — что угодно). Придумать **пароль** (запомни, потом не восстановить). Файл `school-release.keystore` **хранить надёжно** — без него нельзя выпускать новые версии.

### 5.2 Настроить подпись

Создать файл `web/android/key.properties`:
```
storePassword=твой-пароль
keyPassword=твой-пароль
keyAlias=school
storeFile=school-release.keystore
```

Открыть `web/android/app/build.gradle` и добавить перед блоком `android { ... }`:
```gradle
def keystorePropertiesFile = rootProject.file("key.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

Внутри `android { ... }` добавить:
```gradle
signingConfigs {
    release {
        keyAlias keystoreProperties['keyAlias']
        keyPassword keystoreProperties['keyPassword']
        storeFile file(keystoreProperties['storeFile'])
        storePassword keystoreProperties['storePassword']
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
    }
}
```

### 5.3 Собрать release APK

```bash
cd web/android
./gradlew.bat assembleRelease
```

Готовый APK — `web/android/app/build/outputs/apk/release/app-release.apk`. **Его** и выкладывать на школьный сайт `https://school.rskbot.ru/downloads/`.

---

## 6. Как обновлять после изменений в React-коде

Просто:
```bash
cd web
npm run build:android
```

Потом пересобрать APK (шаги 3 или 5.3) и залить на сервер.

Автообновление в приложении добавим отдельной фазой (Фаза 3 плана) — тогда пользователи будут получать новые APK автоматически.
