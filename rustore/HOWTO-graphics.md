# Как сделать графику для RuStore

## 1. Иконка 512×512 PNG

Источник: `web/public/emblem_shkoly.png` (или `web/public/icon.png`).

**Онлайн-конвертер (проще всего):**
1. Открой [iloveimg.com/resize-image](https://www.iloveimg.com/resize-image).
2. Загрузи `emblem_shkoly.png`.
3. Задай **точный размер 512×512**, включи «Keep proportions» — если исходник квадратный, ок; если нет — обрежь заранее.
4. Сохрани как `icon-512.png`. Готово.

**Требования RuStore:**
- PNG (не JPEG).
- Точно 512×512 px.
- Без прозрачности (белый или цветной фон).
- Без надписей, обычно достаточно эмблемы школы.

## 2. Feature graphic 1024×500 PNG

Источник: [feature.svg](feature.svg) в этой папке.

**Способ A — через браузер (быстро):**
1. Открой `feature.svg` в Chrome (перетащи файл в окно).
2. `F12` → device toolbar → задай **Responsive** → **1024 × 500** сверху.
3. Правый угол → `⋮` → **Capture full size screenshot** (не screenshot, а именно full-size, иначе получишь только видимую часть).

**Способ B — онлайн-конвертер:**
1. Открой [cloudconvert.com/svg-to-png](https://cloudconvert.com/svg-to-png).
2. Загрузи `feature.svg`.
3. Нажми ⚙ → **Width 1024, Height 500** → **Convert**.
4. Скачай PNG.

**Требования RuStore:**
- PNG.
- Точно 1024×500 px.
- Без надписей на 20% с боков (RuStore на разных устройствах обрезает края) — у нас всё в безопасной зоне.

## 3. Скриншоты 1080×2400 PNG

Инструкция — [screenshots.md](screenshots.md).

---

## Куда потом всё сложить

RuStore Console просто попросит загрузить файлы. Никаких путей в проекте они не занимают. Локально удобно держать в этой папке:

```
rustore/
  icon-512.png            ← иконка
  feature-1024x500.png    ← баннер (экспорт из feature.svg)
  screenshots/
    01-day.png
    02-all.png
    03-teacher.png
    04-picker.png
    05-settings.png
    06-dark.png
```
