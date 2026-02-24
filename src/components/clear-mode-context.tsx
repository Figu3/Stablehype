"use client";

import { createContext, useContext, useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "stablehype:clearMode";

interface ClearModeContextValue {
  clearMode: boolean;
  toggleClearMode: () => void;
}

const ClearModeContext = createContext<ClearModeContextValue>({
  clearMode: false,
  toggleClearMode: () => {},
});

export function ClearModeProvider({ children }: { children: React.ReactNode }) {
  const [clearMode, setClearMode] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "1") setClearMode(true);
    } catch {
      // SSR or storage unavailable — ignore
    }
  }, []);

  const toggleClearMode = useCallback(() => {
    setClearMode((prev) => {
      const next = !prev;
      try {
        if (next) {
          localStorage.setItem(STORAGE_KEY, "1");
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {
        // storage unavailable — ignore
      }
      return next;
    });
  }, []);

  return (
    <ClearModeContext.Provider value={{ clearMode, toggleClearMode }}>
      {children}
    </ClearModeContext.Provider>
  );
}

export function useClearMode() {
  return useContext(ClearModeContext);
}
