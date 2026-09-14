import { useEffect, useRef, useState } from 'react';
import { subscribeDialog, type DialogState } from '../lib/dialog';

export default function DialogRoot() {
  const [state, setState] = useState<DialogState>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState('');

  useEffect(() => subscribeDialog(setState), []);

  useEffect(() => {
    if (state?.type === 'prompt') {
      setValue(state.opts.initialValue ?? '');
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [state]);

  useEffect(() => {
    if (!state) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (state.type === 'confirm') state.resolve(false);
        else state.resolve(null);
      }
      if (e.key === 'Enter' && state.type === 'confirm') {
        state.resolve(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state]);

  if (!state) return null;

  const backdropClick = () => {
    if (state.type === 'confirm') state.resolve(false);
    else state.resolve(null);
  };

  const isConfirm = state.type === 'confirm';
  const isPrompt = state.type === 'prompt';
  const opts = state.opts;
  const confirmText = opts.confirmText ?? (isConfirm ? 'Подтвердить' : 'Сохранить');
  const cancelText = opts.cancelText ?? 'Отмена';
  const danger = isConfirm && (opts as { danger?: boolean }).danger;

  const submit = () => {
    if (state.type === 'confirm') state.resolve(true);
    else state.resolve(value);
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm grid place-items-center px-4 animate-[fadeIn_.15s_ease-out]"
      onClick={e => { if (e.target === e.currentTarget) backdropClick(); }}
    >
      <div className="w-full max-w-sm bg-bg-light dark:bg-bg-dark rounded-3xl shadow-2xl p-7 animate-[popIn_.2s_ease-out]">
        {opts.title && (
          <h3 className="font-serif text-[24px] -tracking-[.01em] font-normal leading-tight mb-2">
            {opts.title}
          </h3>
        )}
        {isConfirm && (opts as ConfirmOpts).banner && (() => {
          const b = (opts as ConfirmOpts).banner!;
          const critical = b.kind === 'critical';
          return (
            <div className={[
              'mt-1 mb-3 flex items-start gap-2.5 rounded-xl px-3 py-2.5 border',
              critical
                ? 'bg-red-50 dark:bg-red-950/40 border-red-300/70 dark:border-red-900/60 text-red-700 dark:text-red-300'
                : 'bg-accent-soft dark:bg-accent-soft-dark border-accent/25 dark:border-accent-dark/30 text-accent dark:text-accent-dark',
            ].join(' ')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-px">
                {critical
                  ? <path d="M12 9v4M12 17h.01M4.9 20.5h14.2a2 2 0 001.75-2.98l-7.1-12.5a2 2 0 00-3.5 0L3.16 17.52A2 2 0 004.9 20.5z" />
                  : <><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></>}
              </svg>
              <span className="text-[13px] font-semibold leading-tight">{b.text}</span>
            </div>
          );
        })()}
        {(isConfirm || opts.message) && (
          <p className="text-ink-2-light dark:text-ink-2-dark text-[14.5px] leading-relaxed">
            {isConfirm ? opts.message : opts.message}
          </p>
        )}
        {isPrompt && (
          <div className="mt-4">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={e => setValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submit(); }}
              placeholder={(opts as PromptOpts).placeholder}
              className="w-full bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark rounded-xl px-3.5 py-3 text-[15px] focus:outline-none focus:border-ink-light dark:focus:border-ink-dark"
            />
          </div>
        )}
        <div className="flex gap-2 mt-6">
          <button
            onClick={backdropClick}
            className="flex-1 py-2.5 rounded-xl bg-panel-light dark:bg-panel-dark border border-line-light dark:border-line-dark font-semibold text-[14px] text-ink-light dark:text-ink-dark hover:bg-line-2-light dark:hover:bg-line-2-dark transition-colors"
          >
            {cancelText}
          </button>
          <button
            onClick={submit}
            className={[
              'flex-1 py-2.5 rounded-xl font-semibold text-[14px] transition-opacity hover:opacity-90',
              danger
                ? 'bg-red-600 text-white'
                : 'bg-ink-light text-bg-light dark:bg-ink-dark dark:text-bg-dark',
            ].join(' ')}
          >
            {confirmText}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes popIn { from { opacity: 0; transform: translateY(6px) scale(.98) } to { opacity: 1; transform: translateY(0) scale(1) } }
      `}</style>
    </div>
  );
}

interface PromptOpts { placeholder?: string }
interface ConfirmOpts { banner?: { kind: 'critical' | 'info'; text: string } }
