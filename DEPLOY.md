# Деплой на VPS — с нуля до `https://school.rskbot.ru`

Инструкция для полного разворачивания проекта на своём Linux-сервере: сайт, API, БД, HTTPS-сертификат, раздача APK. Ориентировано на **Ubuntu 22.04 / 24.04**.

**Что получишь в итоге:**
- `https://school.rskbot.ru` — публичный сайт для учеников
- `https://school.rskbot.ru/admin` — админ-панель
- `https://school.rskbot.ru/api/*` — бэкенд
- `https://school.rskbot.ru/downloads/…apk` — раздача APK
- Автоматический HTTPS через Caddy + Let's Encrypt
- PostgreSQL с расписанием
- Node.js API как systemd-сервис (автозапуск при перезагрузке)

---

## 1. Купить VPS

Что подойдёт — любой Linux VPS с публичным IP. Минимум:
- **RAM:** 1 ГБ (лучше 2 ГБ)
- **CPU:** 1 vCPU
- **Диск:** 20 ГБ SSD
- **OS:** Ubuntu 22.04 LTS или 24.04 LTS

Провайдеры (по возрастанию цены):
- [Timeweb Cloud](https://timeweb.cloud) — 200–400 ₽/мес
- [Reg.ru](https://www.reg.ru/vps) — 300–500 ₽/мес
- [Selectel](https://selectel.ru/services/cloud/servers/) — 400–800 ₽/мес

При заказе:
- Выбрать «Ubuntu 22.04» или «24.04»
- Задать root-пароль (или загрузить SSH-ключ, если умеешь)
- Сохранить IP-адрес сервера

---

## 2. Настроить DNS

В панели домена `rskbot.ru` создать **A-запись**:

| Тип | Имя | Значение | TTL |
|-----|-----|----------|-----|
| A | school | IP-адрес твоего VPS | 300 |

Проверить (у себя в PowerShell на Windows, минут через 10):
```bash
nslookup school.rskbot.ru
```

Должно вернуть IP сервера.

---

## 3. Подключиться к серверу

Из Windows PowerShell:
```bash
ssh root@ТВОЙ-IP-СЕРВЕРА
```
Ввести root-пароль, который дал провайдер.

Все дальнейшие команды — на сервере (в этом SSH-соединении).

---

## 4. Первичная настройка сервера

### 4.1 Обновить пакеты
```bash
apt update && apt upgrade -y
```

### 4.2 Создать своего пользователя (не работать под root постоянно)
```bash
adduser deploy
usermod -aG sudo deploy
```

Придумать пароль для `deploy`. Дальнейшие команды — из-под него:
```bash
su - deploy
```

### 4.3 Настроить firewall
```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

---

## 5. Установить Node.js 20

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x.x
npm -v
```

---

## 6. Установить PostgreSQL

```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable --now postgresql
```

Создать БД и пользователя:
```bash
sudo -u postgres psql
```

В psql:
```sql
CREATE USER raspisanie WITH PASSWORD 'Kfmerkdnf290K';
CREATE DATABASE raspisanie OWNER raspisanie;
GRANT ALL PRIVILEGES ON DATABASE raspisanie TO raspisanie;
\q
```

Проверить подключение:
```bash
psql -U raspisanie -h 127.0.0.1 -d raspisanie
# спросит пароль → введи → должно открыться raspisanie=>
\q
```

---

## 7. Установить Caddy (веб-сервер с автоматическим HTTPS)

Caddy сам получает и обновляет сертификат Let's Encrypt — ничего настраивать вручную не надо.

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install -y caddy
```

---

## 8. Залить проект на сервер

### Способ А (рекомендую): через git

Если код в GitHub (можно приватный репозиторий):
```bash
cd ~
git clone https://github.com/schwf3xlr/raspisanie.git
cd raspisanie
```

Для приватного репо потребуется deploy-ключ или Personal Access Token.

### Способ Б: с Windows напрямую через WinSCP

1. Скачать [WinSCP](https://winscp.net/eng/download.php).
2. Подключиться: хост=IP, пользователь=deploy, пароль=твой.
3. Слева — папка `C:\Users\Лев\Desktop\Проекты\Расписание`, справа — `/home/deploy/`.
4. Перетащить проект. **Не копировать** `node_modules`, `.git`, `web/android/build`, `api/data` — они не нужны, только замедлят.

---

## 9. Настроить бэкенд

```bash
cd ~/raspisanie/api
cp .env.example .env
nano .env
```

Заполнить:
```env
DATABASE_URL="postgresql://raspisanie:ТВОЙ-ПАРОЛЬ-ИЗ-ПУНКТА-6@127.0.0.1:5432/raspisanie?schema=public"
PORT=3001
ADMIN_LOGIN=admin
ADMIN_PASSWORD=придумай-надёжный-пароль-для-админа
SESSION_SECRET=длинная-случайная-строка-минимум-32-символа
NODE_ENV=production
```

Сгенерировать случайный секрет:
```bash
openssl rand -base64 32  # tIpr30iJG7eyBbOQB2vpkwevtzMec+T+kZCxNr9fEx8=
```

Установить зависимости и применить миграции:
```bash
npm install
npx prisma migrate deploy
npx prisma generate
npm run build
```

Первый запуск (проверим что работает):
```bash
npm start
```

Должно быть: `Админ: логин "admin" (пароль из .env)`. Нажми `Ctrl+C`.

---

## 10. Оформить бэкенд как systemd-сервис

Чтобы стартовал сам после перезагрузки:

```bash
sudo nano /etc/systemd/system/raspisanie-api.service
```

Вставить:
```ini
[Unit]
Description=Raspisanie API
After=network.target postgresql.service
Requires=postgresql.service

[Service]
Type=simple
User=deploy
WorkingDirectory=/home/deploy/raspisanie/api
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Запустить:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now raspisanie-api
sudo systemctl status raspisanie-api      # должно быть active (running)
sudo journalctl -u raspisanie-api -f      # смотреть логи, Ctrl+C чтобы выйти
```

Проверить, что API отвечает:
```bash
curl http://127.0.0.1:3001/api/health
# {"ok":true}
```

---

## 11. Собрать фронтенд

```bash
cd ~/raspisanie/web
npm install
npm run build
```

Готовые файлы теперь в `~/raspisanie/web/dist/`.

---

## 12. Настроить Caddy (домен + HTTPS + проксирование)

```bash
sudo nano /etc/caddy/Caddyfile
```

Заменить содержимое на:
```caddyfile
school.rskbot.ru {
    encode gzip

    # API-запросы → Node.js бэкенд
    handle /api/* {
        reverse_proxy 127.0.0.1:3001
    }

    # Скачивание APK и latest.json
    handle /downloads/* {
        uri strip_prefix /downloads
        root * /var/www/downloads
        file_server browse
    }

    # Всё остальное → статика React
    handle {
        root * /home/deploy/raspisanie/web/dist
        try_files {path} /index.html
        file_server
    }
}
```

Создать папку под APK-раздачу:
```bash
sudo mkdir -p /var/www/downloads
sudo chown -R deploy:deploy /var/www/downloads
```

Разрешить Caddy читать проект:
```bash
sudo chmod o+rx /home/deploy
```

Перезапустить Caddy:
```bash
sudo systemctl reload caddy
sudo systemctl status caddy
```

**Первый запуск займёт 20–60 секунд** — Caddy получает сертификат от Let's Encrypt. Если что-то не так:
```bash
sudo journalctl -u caddy -f
```

Открой в браузере: **https://school.rskbot.ru** — должен появиться сайт с зелёным замочком.

---

## 13. Проверить работу

- `https://school.rskbot.ru/` — лендинг
- `https://school.rskbot.ru/app` — выбор класса → расписание
- `https://school.rskbot.ru/admin/login` — вход в админку (логин/пароль из `.env`)
- `https://school.rskbot.ru/api/health` — `{"ok":true}`

---

## 14. Залить APK

Собрать release-APK на Windows (см. [ANDROID.md](ANDROID.md)) и залить на сервер:

```bash
# из Windows PowerShell, из папки проекта:
scp web/android/app/build/outputs/apk/release/app-release.apk deploy@ТВОЙ-IP:/var/www/downloads/raspisanie-1.0.0.apk
```

Теперь ученики могут скачать: **https://school.rskbot.ru/downloads/raspisanie-1.0.0.apk**

Дальше — обновить ссылку на лендинге (в разделе «Скачать») на реальный файл.

---

## 15. Как обновлять код

### Обновление сайта:
```bash
ssh deploy@ТВОЙ-IP
cd ~/raspisanie

# Забрать новый код (git) или залить через WinSCP

cd api
npm install
npx prisma migrate deploy       # если менялась схема БД
npm run build
sudo systemctl restart raspisanie-api

cd ../web
npm install
npm run build

# Caddy сам подхватит новые файлы, перезапускать не нужно
```

### Обновление APK:
Собрать новый APK на Windows, залить `scp`-ом в `/var/www/downloads/raspisanie-X.Y.Z.apk`, обновить страницу «Скачать».

Автообновление в приложении сделаем в Фазе 3 — тогда версия будет читаться из `/api/app/version` и пользователи получат обновление автоматически.

---

## 16. Бэкапы БД

Раз в сутки автоматически, чтобы никогда не потерять расписание:

```bash
sudo nano /etc/cron.daily/raspisanie-backup
```

```bash
#!/bin/bash
DIR=/home/deploy/backups
mkdir -p $DIR
TS=$(date +%Y%m%d-%H%M%S)
sudo -u postgres pg_dump raspisanie | gzip > $DIR/db-$TS.sql.gz
find $DIR -name 'db-*.sql.gz' -mtime +30 -delete
```

```bash
sudo chmod +x /etc/cron.daily/raspisanie-backup
```

Бэкапы будут в `/home/deploy/backups/`, старше 30 дней — удаляются.

**Скачивать себе на всякий:** раз в неделю `scp deploy@IP:/home/deploy/backups/latest.sql.gz .`

---

## 17. Частые проблемы

**Caddy не может получить сертификат** («timeout during connect»)
→ DNS ещё не прописался. Подожди 10-15 мин, `sudo systemctl reload caddy`. Или проверь `nslookup school.rskbot.ru` — должен отвечать IP сервера.

**API возвращает 500, «Cannot read properties of undefined (reading 'findMany')»**
→ Не прошла миграция Prisma. `cd api && npx prisma migrate deploy && sudo systemctl restart raspisanie-api`.

**После деплоя админка не запоминает вход**
→ `NODE_ENV=production` не выставлен → cookies без Secure. Проверь `.env`, перезапусти сервис.

**Порт 3001 занят**
→ Скорее всего API уже висит вручную. `sudo systemctl stop raspisanie-api`, потом заново.

**«502 Bad Gateway» на сайте**
→ Node.js упал. Смотри `sudo journalctl -u raspisanie-api -n 50`.

**Не могу подключиться по SSH**
→ ufw заблокировал 22? `sudo ufw allow OpenSSH && sudo ufw reload`. С root-паролем провайдер обычно даёт «recovery mode» из своей панели.

---

## 18. Что ещё стоит сделать

- **Fail2ban** — защита от подбора SSH: `sudo apt install -y fail2ban`
- **Отключить пароль для root**: в `/etc/ssh/sshd_config` поставить `PermitRootLogin no`, `PasswordAuthentication no` (только после того, как настроишь SSH-ключ для `deploy`).
- **Мониторинг**: [Uptime Kuma](https://github.com/louislam/uptime-kuma) — покажет, если сайт лёг.
- **HSTS**: Caddy включает по умолчанию.

---

## Готово

Если всё прошло без ошибок — у школы есть работающий сайт по адресу `https://school.rskbot.ru`. Ученики могут заходить в браузере или установить APK.

Дальше — Фаза 2 (splash + иконки в APK), Фаза 3 (автообновления), Фаза 4 (push-уведомления, если понадобятся).
