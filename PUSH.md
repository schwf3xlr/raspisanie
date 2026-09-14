# Push-уведомления (Firebase Cloud Messaging)

Пошаговая инструкция, как включить push-уведомления в приложении «Расписание СОШ №44».

## Как это устроено

1. Приложение при старте (только на телефоне) просит разрешение на уведомления и получает от FCM свой уникальный **токен устройства**.
2. Токен отправляется на бэкенд `POST /api/push/register` вместе с классом ученика или id учителя.
3. Когда админ публикует день/неделю и ставит галочку «Отправить push», бэкенд идёт в FCM с сервисным аккаунтом и рассылает пуш всем токенам подходящей аудитории.
4. Битые токены (устройство удалено, приложение снесено) чистятся автоматически при первой неудаче отправки.

## 1. Создать Firebase-проект

1. Открыть [console.firebase.google.com](https://console.firebase.google.com).
2. **Add project** → имя, например `raspisanie-sh44`. Google Analytics — не нужно.
3. Дождаться создания. Открыть проект.

## 2. Зарегистрировать Android-приложение

1. В обзоре проекта: значок Android (`</>` тоже есть, но нам нужен Android).
2. **Android package name:** `ru.rskbot.school44.raspisanie` (ровно как в `web/capacitor.config.ts`).
3. Nickname: `Расписание СОШ №44`.
4. SHA-1 — не обязателен для FCM (нужен только для Google Sign-In).
5. **Next** → скачать **`google-services.json`**.
6. Положить его в `web/android/app/google-services.json`.
   > Файл в `.gitignore` — коммитить не надо. Хранить локально/на CI-сервере.
7. Остальные шаги мастера можно пропустить (плагин Gradle уже настроен, SDK подключён через Capacitor).

## 3. Сервисный аккаунт для бэкенда

Бэкенд отправляет пуши через FCM HTTP v1 API, ему нужен ключ **сервисного аккаунта** (это НЕ google-services.json).

1. В Firebase Console: **⚙ Project settings → Service accounts**.
2. Внизу: **Generate new private key**. Скачается JSON-файл вида `raspisanie-sh44-firebase-adminsdk-xxxxx.json`.
3. Положить на сервер, например: `/opt/raspisanie/fcm-service-account.json`.
4. В `.env` бэкенда добавить:
   ```
   FCM_SERVICE_ACCOUNT_FILE=/opt/raspisanie/fcm-service-account.json
   ```
   Либо (для CI/Docker без файла) — весь JSON одной строкой:
   ```
   FCM_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
   ```
5. Перезапустить `raspisanie-api.service`. В логах должно появиться:
   ```
   [push] FCM активен, project=raspisanie-sh44
   ```
   Если конфиг не найден — увидите `[push] FCM не сконфигурирован` и в админке галочка «Отправить push» будет неактивна.

> **Секрет!** Сервисный аккаунт даёт полный доступ к FCM проекта. НЕ коммитить, НЕ пересылать в мессенджерах, если утёк — сразу создать новый через **Service accounts → keys → Delete**.

## 4. Собрать и залить APK

1. `cd web && npm i` — подтянет `@capacitor/push-notifications`.
2. `npm run build:android` — соберёт web + `cap sync android`.
3. Открыть в Android Studio (`npm run open:android`), собрать релиз (см. [ANDROID.md](ANDROID.md)).
4. Обновить `latest.json` и APK на сервере в `/var/www/downloads/`.

При первом запуске новой версии на телефоне:
- Android покажет диалог «Разрешить уведомления?» — надо разрешить.
- В логах приложения (Chrome DevTools через `chrome://inspect`): `[push] token получен, длина = 163`.
- В бэкенде: `POST /api/push/register 200`.

## 5. Проверить

1. В админке зайти в **Расписание**, выбрать день с уроками.
2. Нажать **Опубликовать день**. В открывшемся окне:
   - галочка «Отправить push-уведомление» должна быть активна,
   - подпись должна показывать сколько устройств получит пуш (например: «Получат ~3 устройств из 5»).
3. Опубликовать. На телефоне через 1–5 сек прилетит уведомление «Расписание опубликовано».

Если ничего не пришло:
- Проверить, что телефон подключён к интернету.
- Логи бэкенда: `journalctl -u raspisanie-api -f` — должны быть строки `[push] ...`.
- В админке `GET /api/admin/push/status` вернёт `configured: true` и число зарегистрированных устройств.
- Проверить, что уведомления для приложения не отключены в системных настройках Android.

## Что дальше

- Тонкая настройка иконки в статус-баре: положить `web/android/app/src/main/res/drawable/ic_stat_push.xml` и добавить в манифест `<meta-data android:name="com.google.firebase.messaging.default_notification_icon" android:resource="@drawable/ic_stat_push" />`.
- Каналы уведомлений (Android 8+): по умолчанию Capacitor создаёт канал `Default`. Если нужны разные звуки для «отмена урока» и «новая неделя» — регистрировать каналы вручную.
- Массовая рассылка не по классу, а по всей школе: в админке нужна отдельная страница `Уведомления → Всем` (endpoint `/api/admin/push/broadcast` уже готов).
