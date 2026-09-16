# Восстановление / переустановка Firebase-проекта

Инструкция «с нуля» — что делать, если Firebase-проект удалён (или создаётся впервые). После неё будут работать: **push-уведомления в приложении** и **синхронизация с Google Таблицами** (у них общий сервисный аккаунт).

Не потребуется трогать: сервер (VPS), домен, БД, keystore для подписи APK. Всё остальное — пересобрать один раз.

---

## Шаг 1 · Создать Firebase-проект

1. Открой [console.firebase.google.com](https://console.firebase.google.com).
2. **Add project** → название на свой вкус, например `raspisanie-sh44`. Оно станет частью Project ID (Firebase его слегка изменит, если занято — например `raspisanie-sh44-a1b2c`).
3. Google Analytics — **не нужно**, выключи.
4. **Create project**, дождись готовности.

Запиши себе **Project ID** (в шапке проекта). Он же — Google Cloud Project ID; понадобится ниже.

---

## Шаг 2 · Зарегистрировать Android-приложение

1. В обзоре проекта нажми значок **Android**.
2. **Android package name:** `ru.school44omsk.raspisanie` (ровно как в [web/capacitor.config.ts](web/capacitor.config.ts)).
3. Nickname: `Расписание СОШ №44`.
4. SHA-1 — пропускаем (для FCM не нужен).
5. **Register app** → скачивается `google-services.json`.
6. Положи его в **`web/android/app/google-services.json`** (замени старый, если был).
   > Файл в `.gitignore` — коммитить не надо.
7. Остальные шаги мастера пропускаем — SDK уже подключён через Capacitor.

---

## Шаг 3 · Включить Google Sheets API

Нужен для синхронизации расписания с Google-таблицами.

1. Открой [console.cloud.google.com/apis/library/sheets.googleapis.com](https://console.cloud.google.com/apis/library/sheets.googleapis.com).
2. Наверху проверь, что выбран **тот же проект**, что создал в Firebase (`raspisanie-sh44` или как назвал).
3. **Enable**. Готово, бесплатно.

---

## Шаг 4 · Создать сервисный аккаунт (ключ для бэкенда)

Один и тот же ключ работает и для FCM (push), и для Sheets — на бэкенде фолбэк.

### 4.1 Скачать ключ

1. Firebase Console → **⚙ Project settings → Service accounts** (вкладка).
2. Внизу — **Generate new private key** → **Generate key**.
3. Скачивается JSON вида `raspisanie-sh44-firebase-adminsdk-xxxxx-yyyyy.json`.
4. **Переименуй** его локально на Windows в `fcm-service-account.json` (короче — удобнее в командах).

> **Это секрет!** Тот, у кого есть этот файл, может слать push от твоего имени и читать/писать таблицы, к которым он получил доступ. НЕ коммитить, НЕ пересылать в мессенджерах. Утёк — удали в Console (Service accounts → Keys → удалить), сгенерируй новый.

Из файла нам будет нужен ещё **email сервисного аккаунта** — он внутри, поле `"client_email"`. Обычно вида:
```
firebase-adminsdk-xxxxx@raspisanie-sh44.iam.gserviceaccount.com
```
Запомни его — понадобится ниже, чтобы расшарить таблицы.

### 4.2 Загрузить ключ на сервер

Из PowerShell на Windows, из папки, куда сохранил файл (например, `Downloads`):

```bash
scp fcm-service-account.json deploy@school.rskbot.ru:/home/deploy/raspisanie/api/fcm-service-account.json
```

Спросит пароль пользователя `deploy` — введи.

### 4.3 Закрыть права + прописать в `.env`

Подключись к серверу:

```bash
ssh deploy@school.rskbot.ru
```

```bash
chmod 600 ~/raspisanie/api/fcm-service-account.json
ls -la ~/raspisanie/api/fcm-service-account.json
```

Должно показать `-rw-------` и владельца `deploy deploy`.

Проверь `.env` — если строка была раньше, ничего добавлять не нужно; если её нет:

```bash
nano ~/raspisanie/api/.env
```

Добавь (или проверь):
```env
FCM_SERVICE_ACCOUNT_FILE=/home/deploy/raspisanie/api/fcm-service-account.json
```

Сохрани `Ctrl+O` → `Enter` → `Ctrl+X`.

### 4.4 Перезапустить бэкенд

```bash
sudo systemctl restart raspisanie-api
sudo journalctl -u raspisanie-api -n 30 --no-pager | grep push
```

Должна появиться строка `[push] FCM активен, project=<твой project id>`. Если `[push] FCM не сконфигурирован` — проверь путь в `.env` и права на файл.

---

## Шаг 5 · Расшарить существующие Google-таблицы

**Email сервисного аккаунта поменялся** (новый проект → новый service account). Все таблицы, которые были расшарены старому, теперь его не видят.

Для **каждой** таблицы, привязанной в панели `/admin/sheets`:

1. Открой её в Google Sheets.
2. **Настройки доступа** (кнопка «Настройки доступа» / «Share» сверху).
3. Введи новый email сервисного аккаунта (`firebase-adminsdk-xxxxx@<project-id>.iam.gserviceaccount.com`).
4. Роль: **Редактор** (если нужен и импорт, и экспорт) или **Читатель** (только импорт).
5. Уведомление отправлять — **не нужно**.
6. **Отправить**.

Совет: email нового сервисного аккаунта также виден в панели: **/admin/sheets → шапка «Расшарьте таблицу этому e-mail»**. Скопируй оттуда.

---

## Шаг 6 · Пересобрать APK

`google-services.json` встраивается в APK при сборке. Значит нужна новая версия.

1. **Бампни версию** — [web/android/app/build.gradle](web/android/app/build.gradle):
   ```
   versionCode 20     // было 19
   versionName "2.0.1"
   ```
2. Собери:
   ```bash
   cd web && npm run build:android
   ```
3. Открой в Android Studio (`npm run open:android`), собери релиз тем же keystore-файлом. Подробности в [ANDROID.md](ANDROID.md).
4. Загрузи новый APK через **Панель → Приложение → Загрузить APK**, потом **«В релиз ↓»** → **«Опубликовать версию»**.

Установленные приложения при первом же открытии заметят новую версию и предложат обновиться. Push при этом переподключится к новому Firebase-проекту автоматически (перерегистрация токена).

---

## Шаг 7 · Проверить, что всё работает

### Push:

1. Открой обновлённое приложение на телефоне.
2. Дай разрешение на уведомления (если попросит).
3. В **Панель → Приложение → Устройства** — через минуту должен появиться твой токен (новый, не старый).
4. **Панель → Расписание** → опубликуй любой день с галкой «Отправить push» → в течение 1-5 сек прилетит уведомление.

### Sheets:

1. **Панель → Google Таблицы** → у любой существующей привязки нажми **⇣ Импорт** или **⇡ Экспорт**.
2. Если работает — успех. Если ошибка «Нет доступа к таблице» — забыл расшарить сервисному аккаунту (см. шаг 5). Если «unregistered callers» — забыл включить Sheets API (см. шаг 3).

---

## Что можно почистить

- **Панель → Приложение → Устройства → «Удалить все»** — старые токены от предыдущего Firebase-проекта. Они всё равно не работают (Firebase их не знает), но занимают место в списке. Живые устройства сами перерегистрируются при следующем открытии.
- В Firebase Console → **⚙ Project settings → Service accounts → Keys** — если у тебя там несколько старых ключей, можешь удалить все, кроме того, что сейчас на сервере.

---

## Сводка «что где лежит»

| Что | Где | Секрет? |
|---|---|---|
| `google-services.json` | `web/android/app/` | Публичный (встраивается в APK) |
| `fcm-service-account.json` | На сервере: `/home/deploy/raspisanie/api/` | **Секрет** |
| Email сервисного аккаунта | Внутри `fcm-service-account.json`, поле `client_email` | Публичный |
| Firebase Project ID | В `google-services.json` или в шапке Firebase Console | Публичный |

Всё, что помечено «Секрет», — не в git, не в мессенджерах, только на сервере.

---

## Если что-то забыл — быстрый чек

- Push не идёт → **шаг 4.4** (log `[push] FCM активен`).
- Sheets ошибка «unregistered callers» → **шаг 3** (включить Sheets API).
- Sheets ошибка «No permission» → **шаг 5** (расшарить таблицу).
- Приложение не видит новую версию → **шаг 6** (бампнуть versionCode).
- Токен в устройствах не появляется → на телефоне отозвано разрешение на уведомления, или сеть не пускает FCM.
