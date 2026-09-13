import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminGroup } from '../../lib/admin-api';
import type { ClickModifiers } from './ScheduleGrid';

interface Anchor { className: string; number: number }

export interface ClipboardCell {
  dRow: number;
  dCol: number;
  groups: AdminGroup[];
}
export interface Clipboard {
  cells: ClipboardCell[];
  width: number;
  height: number;
}

interface Args {
  classes: string[];
  numbers: number[];
  // как получить groups текущей ячейки в момент copy
  groupsAt: (className: string, number: number) => AdminGroup[];
  // как paste'нуть в конкретную ячейку
  onPaste: (className: string, number: number, groups: AdminGroup[]) => Promise<void>;
}

export function useGridSelection({ classes, numbers, groupsAt, onPaste }: Args) {
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [clipboard, setClipboard] = useState<Clipboard | null>(null);

  const classIdx = useMemo(() => {
    const m = new Map<string, number>();
    classes.forEach((c, i) => m.set(c, i));
    return m;
  }, [classes]);
  const numberIdx = useMemo(() => {
    const m = new Map<number, number>();
    numbers.forEach((n, i) => m.set(n, i));
    return m;
  }, [numbers]);

  const key = (c: string, n: number) => `${c}::${n}`;

  const rectFromAnchor = useCallback((toCls: string, toN: number): Set<string> => {
    if (!anchor) return new Set([key(toCls, toN)]);
    const c0 = classIdx.get(anchor.className) ?? 0;
    const c1 = classIdx.get(toCls) ?? 0;
    const n0 = numberIdx.get(anchor.number) ?? 0;
    const n1 = numberIdx.get(toN) ?? 0;
    const [ca, cb] = c0 <= c1 ? [c0, c1] : [c1, c0];
    const [na, nb] = n0 <= n1 ? [n0, n1] : [n1, n0];
    const out = new Set<string>();
    for (let c = ca; c <= cb; c++) {
      for (let n = na; n <= nb; n++) {
        out.add(key(classes[c]!, numbers[n]!));
      }
    }
    return out;
  }, [anchor, classes, numbers, classIdx, numberIdx]);

  const onCellClick = useCallback((cls: string, n: number, mods: ClickModifiers) => {
    if (mods.shift && anchor) {
      setSelection(rectFromAnchor(cls, n));
      return;
    }
    if (mods.ctrl) {
      setSelection(prev => {
        const next = new Set(prev);
        const k = key(cls, n);
        if (next.has(k)) next.delete(k);
        else next.add(k);
        return next;
      });
      setAnchor({ className: cls, number: n });
      return;
    }
    setAnchor({ className: cls, number: n });
    setSelection(new Set([key(cls, n)]));
  }, [anchor, rectFromAnchor]);

  const clearSelection = useCallback(() => {
    setSelection(new Set());
    setAnchor(null);
  }, []);

  const selectAll = useCallback(() => {
    const out = new Set<string>();
    for (const c of classes) for (const n of numbers) out.add(key(c, n));
    setSelection(out);
    if (!anchor) setAnchor({ className: classes[0]!, number: numbers[0]! });
  }, [classes, numbers, anchor]);

  const copySelection = useCallback(() => {
    if (selection.size === 0) return;
    const cells: Array<{ cIdx: number; nIdx: number; groups: AdminGroup[] }> = [];
    for (const k of selection) {
      const [cls, nStr] = k.split('::');
      const n = Number(nStr);
      const cIdx = classIdx.get(cls!) ?? 0;
      const nIdx = numberIdx.get(n) ?? 0;
      const g = groupsAt(cls!, n);
      cells.push({ cIdx, nIdx, groups: g });
    }
    if (cells.length === 0) return;
    const minC = Math.min(...cells.map(c => c.cIdx));
    const minN = Math.min(...cells.map(c => c.nIdx));
    const maxC = Math.max(...cells.map(c => c.cIdx));
    const maxN = Math.max(...cells.map(c => c.nIdx));
    setClipboard({
      width: maxC - minC + 1,
      height: maxN - minN + 1,
      cells: cells.map(c => ({ dCol: c.cIdx - minC, dRow: c.nIdx - minN, groups: c.groups })),
    });
  }, [selection, classIdx, numberIdx, groupsAt]);

  const paste = useCallback(async () => {
    if (!clipboard || !anchor) return { pasted: 0 };
    const anchorC = classIdx.get(anchor.className) ?? 0;
    const anchorN = numberIdx.get(anchor.number) ?? 0;
    let pasted = 0;
    for (const cell of clipboard.cells) {
      const tc = classes[anchorC + cell.dCol];
      const tn = numbers[anchorN + cell.dRow];
      if (!tc || tn == null) continue;
      await onPaste(tc, tn, cell.groups);
      pasted++;
    }
    return { pasted };
  }, [clipboard, anchor, classes, numbers, classIdx, numberIdx, onPaste]);

  const pastingRef = useRef(false);
  useEffect(() => {
    const onKey = async (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const inEditableField = tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable;
      const ctrl = e.ctrlKey || e.metaKey;
      // Используем e.code, а не e.key, чтобы работать в любой раскладке (KeyC = физическая клавиша C).
      if (ctrl && e.code === 'KeyC') {
        if (inEditableField) return; // даём браузеру скопировать выделенный текст в инпуте
        e.preventDefault();
        copySelection();
      } else if (ctrl && e.code === 'KeyV') {
        if (inEditableField) return;
        if (pastingRef.current) return;
        e.preventDefault();
        pastingRef.current = true;
        try { await paste(); } finally { pastingRef.current = false; }
      } else if (ctrl && e.code === 'KeyA') {
        if (inEditableField) return;
        e.preventDefault();
        selectAll();
      } else if (e.key === 'Escape') {
        if (inEditableField) return;
        clearSelection();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [copySelection, paste, selectAll, clearSelection]);

  return {
    selection, anchor, clipboard,
    onCellClick, clearSelection, selectAll,
    copySelection, paste,
    isSingle: selection.size === 1 && anchor != null,
    isMulti: selection.size > 1,
  };
}
