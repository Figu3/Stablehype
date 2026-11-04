"use client";

import { useEffect, useState } from "react";

/** Current unix time in seconds, refreshed every 30s. Keeps Date.now() out of render. */
export function useNowSeconds(): number {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
