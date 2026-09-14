import { useCallback, useEffect, useRef, useState } from 'react';
import { adminApi, type ApkStatus, type ApkFileInfo } from '../../lib/admin-api';
import { confirmDialog } from '../../lib/dialog';

export default function AdminApp() {
  const [status, setStatus] = useState<ApkStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const s = await adminApi.apkStatus();
      setStatus(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 4500);
  };

  // ------- Загрузка APK -------
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const onPickFile = () => fileInputRef.current?.click();
  const onFileSelected = (f: File | null) => {
    setSelected(f);
    setUploadName(f ? f.name : '');
  };

  const doUpload = async () => {
    if (!selected) return;
    setUploading(true); setUploadPct(0); setError(null);
    try {
      const res = await adminApi.apkUpload(selected, uploadName.trim() || null, p => setUploadPct(p));
      flash(`Загружен: ${res.file.name} (${humanBytes(res.file.size)})`);
      setSelected(null); setUploadName(''); setUploadPct(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const deleteFile = async (f: ApkFileInfo) => {
    const ok = await confirmDialog({
      title: `Удалить ${f.name}?`,
      message: 'Файл будет удалён с сервера. Если он указан в latest.json, обновление приложения перестанет работать.',
      confirmText: 'Удалить', danger: true,
    });
    if (!ok) return;
    try {
      await adminApi.apkDelete(f.name);
      flash(`Удалён: ${f.name}`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // ------- Manifest -------
  const [mVersionCode, setMVersionCode] = useState('');
  const [mVersionName, setMVersionName] = useState('');
  const [mApkUrl, setMApkUrl] = useState('');
  const [mChangelog, setMChangelog] = useState('');
  const [mMandatory, setMMandatory] = useState(false);
  const [savingManifest, setSavingManifest] = useState(false);

  useEffect(() => {
    if (!status?.manifest) return;
    setMVersionCode(String(status.manifest.versionCode));
    setMVersionName(status.manifest.versionName);
    setMApkUrl(status.manifest.apkUrl);
    setMChangelog(status.manifest.changelog ?? '');
    setMMandatory(!!status.manifest.mandatory);
  }, [status?.manifest?.versionCode, status?.manifest?.versionName, status?.manifest?.apkUrl, status?.manifest?.changelog, status?.manifest?.mandatory]);

  const useFileAsRelease = (f: ApkFileInfo) => {
    setMApkUrl(f.url);
    // подсказка: если в имени файла есть версия вида 1.2.3 - подставляем
    const v = f.name.match(/(\d+)\.(\d+)\.(\d+)/);
    if (v && !mVersionName) setMVersionName(v[0]);
  };

  const saveManifest = async () => {
    setSavingManifest(true); setError(null);
    try {
      await adminApi.apkSaveManifest({
        versionCode: Number(mVersionCode),
        versionName: mVersionName.trim(),
        apkUrl: mApkUrl.trim(),
        changelog: mChangelog.trim() || undefined,
        mandatory: mMandatory,
      });
      flash('Манифест latest.json обновлён - пользователи увидят обновление при следующем открытии.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setSavingManifest(false); }
  };

  const deleteManifest = async () => {
    const ok = await confirmDialog({
      title: 'Снять публикацию версии?',
      message: 'latest.json будет удалён с сервера. Приложение перестанет предлагать обновления, пока Вы не опубликуете новую версию.',
      confirmText: 'Снять публикацию', danger: true,
    });
    if (!ok) return;
    try {
      await adminApi.apkDeleteManifest();
      flash('Манифест удалён.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="min-h-screen">
      <header className="px-4 md:px-8 pt-6 md:pt-8 pb-5 border-b border-line-light dark:border-line-dark">
        <h1 className="font-serif text-[28px] md:text-[36px] -tracking-[.02em] leading-none font-normal">Приложение</h1>
        <p className="text-ink-2-light dark:text-ink-2-dark text-[13.5px] mt-1.5">
          Загрузка новых APK-релизов и управление файлом <code className="bg-panel-light dark:bg-panel-dark px-1.5 py-0.5 rounded">latest.json</code>,
          из которого приложение узнаёт о новых версиях.
        </p>
      </header>

      <div className="px-4 md:px-8 py-6 space-y-6 max-w-4xl">
        {status && !status.configured && (
          <div className="bg-yellow-100 dark:bg-yellow-950/40 border border-yellow-300/60 dark:border-yellow-900/60 text-yellow-900 dark:text-yellow-200 rounded-2xl p-4">
            <div className="font-semibold text-[14px] mb-1">APK-модуль не сконфигурирован</div>
            <div className="text-[13px]">
              На сервере в <code>.env</code> должен быть указан путь к директории загрузок:
              <br />
              <code className="block bg-yellow-50 dark:bg-yellow-950/60 mt-1 p-1.5 rounded text-[12.5px]">APK_DIR=/var/www/downloads</code>
              После этого перезапустите <code>raspisanie-api</code>.
            </div>
          </div>
        )}
        {status?.configured && status.error && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-300/60 dark:border-red-900/60 text-red-700 dark:text-red-400 rounded-2xl p-4 text-[13.5px]">
            <b>Проблема с директорией:</b> {status.error}
            <div className="mt-1 text-[12px]">Путь: <code>{status.apkDir}</code>. Проверьте, что она существует и принадлежит пользователю <code>deploy</code>.</div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-950/40 border border-red-300/60 dark:border-red-900/60 text-red-700 dark:text-red-400 rounded-xl px-3 py-2.5 text-[13.5px]">
            {error}
          </div>
        )}
        {notice && (
          <div className="bg-green-50 dark:bg-green-950/40 border border-green-300/60 dark:border-green-900/60 text-green-700 dark:text-green-400 rounded-xl px-3 py-2.5 text-[13.5px]">
            {notice}
          </div>
        )}

        {/* ============= Загрузка APK ============= */}
        <section className="border border-line-light dark:border-line-dark rounded-2xl p-5">
          <h2 className="font-serif text-[20px] mb-1">Загрузить новый APK</h2>
          <p className="text-ink-2-light dark:text-ink-2-dark text-[13px] mb-4">
            Выберите файл (собранный в Android Studio релиз, подписанный вашим keystore) и загрузите на сервер.
            Максимум 100 МБ.
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".apk,application/vnd.android.package-archive"
            className="hidden"
            onChange={e => onFileSelected(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
            <button
              onClick={onPickFile}
              disabled={!status?.configured || uploading}
              className="px-4 py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark font-semibold text-[13.5px] disabled:opacity-50"
            >
              {selected ? 'Другой файл…' : 'Выбрать APK…'}
            </button>
            {selected && (
              <div className="flex-1 min-w-0 text-[13px] text-ink-2-light dark:text-ink-2-dark truncate">
                {selected.name} <span className="text-ink-3-light dark:text-ink-3-dark tabular-nums">· {humanBytes(selected.size)}</span>
              </div>
            )}
          </div>

          {selected && (
            <>
              <label className="block mt-3">
                <div className="text-[11.5px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark mb-1">Имя на сервере</div>
                <input
                  value={uploadName}
                  onChange={e => setUploadName(e.target.value)}
                  placeholder="raspisanie-1.2.0.apk"
                  className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark tabular-nums"
                />
                <div className="text-[11.5px] text-ink-3-light dark:text-ink-3-dark mt-1">
                  Только латиница / цифры / <code>. - _</code>, должен заканчиваться на <code>.apk</code>. Если файл с таким именем уже есть - перезапишется.
                </div>
              </label>

              {uploadPct != null && (
                <div className="mt-3">
                  <div className="text-[12px] text-ink-2-light dark:text-ink-2-dark mb-1 tabular-nums">{uploadPct}%</div>
                  <div className="h-1.5 bg-line-light dark:bg-line-dark rounded-full overflow-hidden">
                    <div className="h-full bg-accent dark:bg-accent-dark transition-[width]" style={{ width: `${uploadPct}%` }} />
                  </div>
                </div>
              )}

              <div className="mt-4 flex gap-2 flex-wrap">
                <button onClick={() => { setSelected(null); setUploadName(''); setUploadPct(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  disabled={uploading}
                  className="px-4 py-2 rounded-lg bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark text-[13.5px] font-semibold disabled:opacity-50">
                  Отмена
                </button>
                <button onClick={doUpload}
                  disabled={uploading || !uploadName.trim()}
                  className="px-4 py-2 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark text-[13.5px] font-semibold disabled:opacity-50">
                  {uploading ? `Загружаю ${uploadPct ?? 0}%…` : 'Загрузить'}
                </button>
              </div>
            </>
          )}
        </section>

        {/* ============= Список APK ============= */}
        <section className="border border-line-light dark:border-line-dark rounded-2xl p-5">
          <h2 className="font-serif text-[20px] mb-1">Файлы на сервере</h2>
          <p className="text-ink-2-light dark:text-ink-2-dark text-[13px] mb-4">
            Директория: <code className="text-[12px]">{status?.apkDir ?? '-'}</code>
          </p>
          {status?.files?.length ? (
            <ul className="divide-y divide-line-light dark:divide-line-dark">
              {status.files.map(f => (
                <li key={f.name} className="py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-[14px] break-all">{f.name}</div>
                    <div className="text-[11.5px] text-ink-3-light dark:text-ink-3-dark mt-0.5 tabular-nums">
                      {humanBytes(f.size)} · {new Date(f.updatedAt).toLocaleString('ru')}
                    </div>
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-[12px] text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark underline underline-offset-2 break-all">
                      {f.url}
                    </a>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => useFileAsRelease(f)}
                      className="px-3 py-1.5 rounded-lg border border-line-light dark:border-line-dark text-[12.5px] font-semibold text-ink-2-light dark:text-ink-2-dark hover:text-ink-light dark:hover:text-ink-dark whitespace-nowrap">
                      В релиз ↓
                    </button>
                    <button onClick={() => deleteFile(f)}
                      className="px-3 py-1.5 rounded-lg border border-red-300/60 dark:border-red-900/60 text-[12.5px] font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
                      Удалить
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-ink-3-light dark:text-ink-3-dark text-[13.5px]">Пока пусто.</div>
          )}
        </section>

        {/* ============= Manifest latest.json ============= */}
        <section className="border border-line-light dark:border-line-dark rounded-2xl p-5">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
            <h2 className="font-serif text-[20px]">Публикация версии (latest.json)</h2>
            {status?.manifest && (
              <div className="text-[11.5px] text-ink-3-light dark:text-ink-3-dark tabular-nums">
                Обновлён: {status.manifest.updatedAt ? new Date(status.manifest.updatedAt).toLocaleString('ru') : '-'}
              </div>
            )}
          </div>
          <p className="text-ink-2-light dark:text-ink-2-dark text-[13px] mb-4">
            Установленное приложение читает этот файл при каждом старте и сравнивает <code>versionCode</code>
            со своим. Если серверный больше - предлагает обновление.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <label className="block">
              <div className="text-[11.5px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark mb-1">versionCode (число)</div>
              <input value={mVersionCode} onChange={e => setMVersionCode(e.target.value)} inputMode="numeric"
                placeholder="8"
                className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px] tabular-nums" />
            </label>
            <label className="block">
              <div className="text-[11.5px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark mb-1">versionName</div>
              <input value={mVersionName} onChange={e => setMVersionName(e.target.value)}
                placeholder="1.2.0"
                className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[14px] tabular-nums" />
            </label>
            <label className="block md:col-span-2">
              <div className="text-[11.5px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark mb-1">apkUrl (полная ссылка)</div>
              <input value={mApkUrl} onChange={e => setMApkUrl(e.target.value)}
                placeholder="https://school.rskbot.ru/downloads/raspisanie-1.2.0.apk"
                className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[13.5px] break-all" />
              <div className="text-[11.5px] text-ink-3-light dark:text-ink-3-dark mt-1">
                Кнопка «В релиз ↓» рядом с файлом выше заполняет это поле автоматически.
              </div>
            </label>
            <label className="block md:col-span-2">
              <div className="text-[11.5px] font-bold tracking-wider uppercase text-ink-3-light dark:text-ink-3-dark mb-1">changelog (что нового)</div>
              <textarea value={mChangelog} onChange={e => setMChangelog(e.target.value)} rows={3}
                placeholder="Общая таблица школы, конфликт кабинета, звонки в шаблоне…"
                className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-lg px-3 py-2 text-[13.5px]" />
              <div className="text-[11.5px] text-ink-3-light dark:text-ink-3-dark mt-1">
                Показывается пользователю в диалоге обновления.
              </div>
            </label>
            <label className="flex items-center gap-2 md:col-span-2 cursor-pointer select-none">
              <input type="checkbox" checked={mMandatory} onChange={e => setMMandatory(e.target.checked)}
                className="w-4 h-4 accent-accent" />
              <span className="text-[13.5px]">Обязательное обновление (кнопка «Позже» исчезает)</span>
            </label>
          </div>

          <div className="flex flex-wrap gap-2 mt-5">
            <button onClick={saveManifest} disabled={savingManifest || !status?.configured}
              className="px-4 py-2 rounded-lg bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark text-[13.5px] font-semibold disabled:opacity-50">
              {savingManifest ? 'Сохраняем…' : 'Опубликовать версию'}
            </button>
            {status?.manifest && (
              <button onClick={deleteManifest}
                className="px-4 py-2 rounded-lg border border-red-300/60 dark:border-red-900/60 text-red-600 dark:text-red-400 text-[13.5px] font-semibold">
                Снять публикацию
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} КБ`;
  return `${(n / (1024 * 1024)).toFixed(1)} МБ`;
}
