"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface SelectionContextValue {
  selected: Set<string>;
  isSelected: (key: string) => boolean;
  toggle: (key: string) => void;
  toggleMany: (keys: string[], force?: boolean) => void;
  clear: () => void;
}

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({ children }: { children: ReactNode }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const isSelected = useCallback((key: string) => selected.has(key), [selected]);

  const toggle = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleMany = useCallback((keys: string[], force?: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      // Decide whether to add or remove all when `force` isn't supplied:
      // if every key is currently selected, remove them; otherwise add them.
      const allOn = force ?? keys.every((k) => next.has(k));
      if (allOn) {
        for (const k of keys) next.delete(k);
      } else {
        for (const k of keys) next.add(k);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  const value = useMemo<SelectionContextValue>(
    () => ({ selected, isSelected, toggle, toggleMany, clear }),
    [selected, isSelected, toggle, toggleMany, clear],
  );

  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

export function useSelection(): SelectionContextValue {
  const v = useContext(SelectionContext);
  if (!v) throw new Error("useSelection must be used inside <SelectionProvider>");
  return v;
}
