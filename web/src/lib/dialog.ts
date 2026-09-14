export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
  /** Опциональная плашка над сообщением. Например «Критически важное обновление». */
  banner?: { kind: 'critical' | 'info'; text: string };
}

export interface PromptOptions {
  title?: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  confirmText?: string;
  cancelText?: string;
}

export type DialogState =
  | { type: 'confirm'; opts: ConfirmOptions; resolve: (v: boolean) => void }
  | { type: 'prompt'; opts: PromptOptions; resolve: (v: string | null) => void }
  | null;

type Listener = (s: DialogState) => void;

let listener: Listener | null = null;

export function subscribeDialog(fn: Listener): () => void {
  listener = fn;
  return () => { if (listener === fn) listener = null; };
}

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise(resolve => {
    if (!listener) { resolve(window.confirm(opts.message)); return; }
    listener({
      type: 'confirm',
      opts,
      resolve: (v: boolean) => { listener?.(null); resolve(v); },
    });
  });
}

export function promptDialog(opts: PromptOptions): Promise<string | null> {
  return new Promise(resolve => {
    if (!listener) { resolve(window.prompt(opts.message ?? '', opts.initialValue ?? '')); return; }
    listener({
      type: 'prompt',
      opts,
      resolve: (v: string | null) => { listener?.(null); resolve(v); },
    });
  });
}
