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

## 6. Как выпустить новую версию (полный цикл)

Автообновление в приложении уже встроено: при запуске оно читает `https://school.rskbot.ru/downloads/latest.json`, сравнивает с собственной версией и, если есть новее, показывает пользователю модалку «Обновить сейчас / Позже».

Цикл релиза выглядит так:

### 6.1 Изменить versionCode и versionName

Открой `web/android/app/build.gradle`, найди блок `defaultConfig`:
```gradle
defaultConfig {
    applicationId "ru.rskbot.school44.raspisanie"
    minSdkVersion rootProject.ext.minSdkVersion
    targetSdkVersion rootProject.ext.targetSdkVersion
    versionCode 1               ← увеличь на 1 при каждом релизе
    versionName "1.0.0"          ← смени на новую (1.0.1, 1.1.0, ...)
    ...
}
```

**Важно:** `versionCode` — целое число, монотонно растёт. Именно по нему сравнивается «новее / не новее». `versionName` — что видит пользователь.

### 6.2 Собрать релизный APK

```bash
cd web
npm run build:android         # пересобирает React → dist → android/app/src/main/assets
cd android
./gradlew.bat assembleRelease
```

Готовый файл: `web/android/app/build/outputs/apk/release/app-release.apk`.

Переименуй в человеческое имя:
```bash
copy "app-release.apk" "raspisanie-1.0.1.apk"
```

### 6.3 Залить APK на сервер

```powershell
scp web/android/app/build/outputs/apk/release/raspisanie-1.0.1.apk deploy@159.194.242.97:/var/www/downloads/
```

### 6.4 Обновить манифест `latest.json`

Это файл, который приложения будут проверять при запуске. Формат:

```json
{
  "versionCode": 2,
  "versionName": "1.0.1",
  "apkUrl": "https://school.rskbot.ru/downloads/raspisanie-1.0.1.apk",
  "mandatory": false,
  "changelog": "Исправили копирование ячеек, добавили эмблему школы"
}
```

- `versionCode` **должен совпадать** с тем, что в `build.gradle`
- `mandatory: true` — если баг критический, тогда пользователь не сможет закрыть модалку без обновления
- `changelog` — то, что увидит пользователь в модалке; можно кратко

Залей файл на сервер:
```powershell
scp latest.json deploy@159.194.242.97:/var/www/downloads/latest.json
```

Или отредактируй прямо на сервере:
```bash
nano /var/www/downloads/latest.json
```

### 6.5 Проверить

1. Открой на телефоне текущую версию приложения (у пользователя стоит например 1.0.0)
2. Закрой и открой снова
3. Через ~1.5 секунды должна появиться модалка «Обновление · 1.0.1» с changelog
4. Тап «Обновить сейчас» → откроется браузер, начнётся скачивание APK
5. По завершении — тап на файл, Android спросит «Установить», подтверди
6. Приложение перезапустится в новой версии

Если пользователь тапнул «Позже» — модалка не будет вылезать снова до следующего повышения `versionCode`.

### 6.6 Как это устроено под капотом

`web/src/lib/update-check.ts` при старте приложения:
1. Проверяет, что мы в Capacitor (не в браузере) — иначе не работает
2. Читает свой `versionCode` через `App.getInfo().build`
3. Загружает `latest.json`
4. Если удалённая версия больше — показывает confirm-dialog
5. При согласии открывает `apkUrl` — Android скачивает APK и предлагает установить
6. Если пользователь отклонил, версия запоминается в localStorage — заново вылезет только для более новой
