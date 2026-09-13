# Иконка и splash-screen приложения

`icon.png` — эмблема школы (512×512), из неё автоматически генерируются все размеры для Android.

Чтобы сгенерировать иконки:
```bash
cd web
npm run icons
```

Инструмент `@capacitor/assets` создаст:
- `android/app/src/main/res/mipmap-*/ic_launcher*.png` — иконки приложения всех плотностей
- `android/app/src/main/res/drawable-*/splash*.png` — splash-скрин

Если хочется красивее — положи сюда `splash.png` 2732×2732 (эмблема по центру, фон `#0d0d0e`), тогда splash будет чёткий и на 4K-экранах.
