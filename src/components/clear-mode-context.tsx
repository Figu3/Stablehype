"use client";

import { createContext, useContext, useState, useCallback } from "react";

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

  const toggleClearMode = useCallback(() => {
    setClearMode((prev) => !prev);
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
