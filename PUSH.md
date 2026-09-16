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
2. **Android package name:** `ru.school44omsk.raspisanie` (ровно как в `web/capacitor.config.ts`).
3. Nickname: `Расписание СОШ №44`.
4. SHA-1 — не обязателен для FCM (нужен только для Google Sign-In).
5. **Next** → скачать **`google-services.json`**.
6. Положить его в `web/android/app/google-services.json`.
   > Файл в `.gitignore` — коммитить не надо. Хранить локально/на CI-сервере.
7. Остальные шаги мастера можно пропустить (плагин Gradle уже настроен, SDK подключён через Capacitor).

## 3. Сервисный аккаунт для бэкенда

Бэкенд отправляет пуши через FCM HTTP v1 API — ему нужен ключ **сервисного аккаунта** (это НЕ `google-services.json`, а отдельный JSON).

### 3.1 Скачать ключ

1. В Firebase Console: **⚙ Project settings → Service accounts** (вкладка).
2. Внизу — **Generate new private key** → **Generate key**. Скачается JSON-файл вида `raspisanie-sh44-firebase-adminsdk-xxxxx-yyyyy.json`.
3. У себя на Windows переименуй его в `fcm-service-account.json` (просто чтобы удобнее было в командах).

> **Это секрет!** Тот, у кого есть этот файл, может отправлять пуши всем твоим устройствам. НЕ коммитить, НЕ отправлять в мессенджерах. Если утёк — Firebase Console → Service accounts → рядом с ключом «Delete», и сгенерировать новый.

### 3.2 Загрузить на сервер

Из PowerShell на Windows, из папки, куда сохранил ключ (например, `Downloads`):

```bash
scp fcm-service-account.json deploy@school.rskbot.ru:/home/deploy/raspisanie/api/fcm-service-account.json
```

Если у тебя `deploy`-пользователь заходит только по паролю — попросит его.

### 3.3 Ограничить доступ к файлу

Подключись к серверу:
```bash
ssh deploy@school.rskbot.ru
```

Проверь, что файл на месте, и закрой права:
```bash
ls -la ~/raspisanie/api/fcm-service-account.json
chmod 600 ~/raspisanie/api/fcm-service-account.json
```

Теперь читать его сможет только пользователь `deploy` (под ним и запускается сервис).

### 3.4 Прописать в `.env`

```bash
nano ~/raspisanie/api/.env
```

Добавить в конец файла (или раскомментировать, если строка уже есть):
```env
FCM_SERVICE_ACCOUNT_FILE=/home/deploy/raspisanie/api/fcm-service-account.json
```

Сохранить: `Ctrl+O`, `Enter`, `Ctrl+X`.

> Файл в `.gitignore` — `git reset --hard origin/main` при следующем деплое его не тронет.

### 3.5 Перезапустить бэкенд и убедиться

```bash
sudo systemctl restart raspisanie-api
sudo journalctl -u raspisanie-api -n 30 --no-pager
```

Ищи строку:
```
[push] FCM активен, project=raspisanie-sh44
```

Если увидишь `[push] FCM не сконфигурирован` — значит `.env` не подхватился (перепроверь путь и имя переменной) или JSON битый.

### 3.6 (Альтернатива) Через переменную вместо файла

Если по какой-то причине не хочется класть файл на диск — можно передать весь JSON одной строкой:

```bash
# на сервере, в ~/raspisanie/api/.env
FCM_SERVICE_ACCOUNT_JSON={"type":"service_account","project_id":"raspisanie-sh44","private_key":"-----BEGIN…","client_email":"…","..."}
```

Только следи, чтобы кавычки не сломались (у private_key внутри есть `\n` — они должны остаться экранированными). Файл проще, поэтому по умолчанию рекомендую `FCM_SERVICE_ACCOUNT_FILE`.

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
