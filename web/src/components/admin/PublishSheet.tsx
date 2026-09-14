import { useEffect, useState } from 'react';
import { adminApi, type PushStatus, type PublishResponse } from '../../lib/admin-api';

interface Props {
  open: boolean;
  onClose: () => void;
  target: { kind: 'day'; date: string; dateLabel: string } | { kind: 'week'; weekStart: string; weekLabel: string };
  // Классы, которых касается публикация. Пусто → всем.
  classes: string[];
  onDone: (res: PublishResponse) => void;
}

export default function PublishSheet({ open, onClose, target, classes, onDone }: Props) {
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [notify, setNotify] = useState(true);
  const [notifyText, setNotifyText] = useState('');
  const [broadcast, setBroadcast] = useState(false); // всем зарегистрированным, а не только классам с уроками
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setNotifyText('');
    setPending(false);
    adminApi.pushStatus().then(setStatus).catch(() => setStatus(null));
  }, [open]);

  if (!open) return null;

  const configured = status?.configured ?? false;
  const totalDevices = status?.total ?? 0;

  // Оценка охвата: сумма устройств по выбранным классам, либо всего total при broadcast.
  const reachEstimate = (() => {
    if (!status) return null;
    if (broadcast || classes.length === 0) return status.total;
    const set = new Set(classes);
    return status.byClass
      .filter(r => r.className != null && set.has(r.className))
      .reduce((a, r) => a + r.count, 0);
  })();

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      const notifyClasses = notify && !broadcast && classes.length > 0 ? classes : undefined;
      const payload = notify
        ? { notify: true, notifyClasses, notifyText: notifyText.trim() || undefined }
        : {};
      let res: PublishResponse;
      if (target.kind === 'day') {
        res = await adminApi.publishDay({ date: target.date, ...payload });
      } else {
        res = await adminApi.publishWeek({ weekStart: target.weekStart, ...payload });
      }
      onDone(res);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ошибка публикации');
    } finally {
      setPending(false);
    }
  };

  const label = target.kind === 'day' ? target.dateLabel : `неделя ${target.weekLabel}`;

  return (
    <div
      className="fixed inset-0 z-[90] bg-black/40 flex items-end md:items-center justify-center md:p-6"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-bg-light dark:bg-bg-dark w-full max-w-md rounded-t-3xl md:rounded-3xl px-6 pt-6 pb-6 animate-[slideup_.25s_ease-out]">
        <h3 className="font-serif font-medium text-[22px] -tracking-[.01em] mb-1">Опубликовать</h3>
        <p className="text-ink-2-light dark:text-ink-2-dark text-[13.5px]">Расписание на {label} станет видно ученикам.</p>

        <label className="mt-5 flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={notify && configured}
            disabled={!configured}
            onChange={e => setNotify(e.target.checked)}
            className="mt-1 w-4 h-4 accent-accent"
          />
          <div className="flex-1">
            <div className="text-[14.5px] font-semibold">Отправить push-уведомление</div>
            <div className="text-ink-3-light dark:text-ink-3-dark text-[12.5px] mt-0.5">
              {configured
                ? reachEstimate != null
                  ? `Получат ~${reachEstimate} устройств${plural(reachEstimate)} из ${totalDevices}`
                  : 'Подгружаю статистику…'
                : 'FCM не сконфигурирован — см. PUSH.md'}
            </div>
          </div>
        </label>

        {notify && configured && (
          <>
            {classes.length > 0 && (
              <label className="mt-3 flex items-start gap-3 cursor-pointer select-none pl-7">
                <input
                  type="checkbox"
                  checked={broadcast}
                  onChange={e => setBroadcast(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-accent"
                />
                <div className="flex-1">
                  <div className="text-[13.5px]">Всем зарегистрированным</div>
                  <div className="text-ink-3-light dark:text-ink-3-dark text-[12px] mt-0.5">
                    Иначе — только классам: {classes.slice(0, 6).join(', ')}{classes.length > 6 ? ` +${classes.length - 6}` : ''}
                  </div>
                </div>
              </label>
            )}

            <div className="mt-4">
              <div className="text-[12.5px] text-ink-3-light dark:text-ink-3-dark mb-1.5">Текст (по умолчанию — стандартный)</div>
              <input
                type="text"
                value={notifyText}
                onChange={e => setNotifyText(e.target.value)}
                placeholder={target.kind === 'day' ? `Расписание на ${target.dateLabel} доступно` : `Расписание на ${target.weekLabel} доступно`}
                className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-xl px-3.5 py-2.5 text-[14.5px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark"
              />
            </div>
          </>
        )}

        {error && (
          <div className="mt-4 text-[13px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 rounded-xl px-3 py-2.5">{error}</div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={pending}
            className="flex-1 py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark font-semibold text-[14px] disabled:opacity-50"
          >Отмена</button>
          <button
            onClick={submit}
            disabled={pending}
            className="flex-1 py-2.5 rounded-xl bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark font-semibold text-[14px] disabled:opacity-50"
          >{pending ? 'Публикую…' : 'Опубликовать'}</button>
        </div>
      </div>
      <style>{`@keyframes slideup { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}

function plural(n: number): string {
  const abs = Math.abs(n) % 100;
  const last = abs % 10;
  if (abs > 10 && abs < 20) return '';
  if (last === 1) return 'о';
  if (last >= 2 && last <= 4) return 'а';
  return '';
}
