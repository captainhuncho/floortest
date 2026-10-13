"use client";

import { useCallback, useState, useSyncExternalStore } from "react";

const never = () => () => {};

/**
 * A value only the browser knows (its time zone, something saved on this device). The server and the first paint use
 * `server`; the browser's own value follows straight after hydration, with no extra render pass. `read` must return a
 * string, number or boolean (compared by value), and must not throw.
 */
export function useBrowserValue<T extends string | number | boolean>(read: () => T, server: T): T {
  return useSyncExternalStore(never, read, () => server);
}

/** Like useBrowserValue, for a choice remembered on this device that the person can then change on the page. */
export function useDeviceState<T extends string | number | boolean>(read: () => T, server: T): [T, (v: T) => void] {
  const fromDevice = useBrowserValue(read, server);
  const [mine, setMine] = useState<{ v: T } | null>(null);
  const set = useCallback((v: T) => setMine({ v }), []);
  return [mine ? mine.v : fromDevice, set];
}

/** Reads one key saved on this device ("" when there is none or storage is blocked). */
export function stored(key: string, area: "local" | "session" = "local"): string {
  try {
    return (area === "local" ? localStorage : sessionStorage).getItem(key) ?? "";
  } catch {
    return "";
  }
}

/** The browser's time zone, or `fallback` if it doesn't say. */
export const browserTimeZone = (fallback: string) => () => Intl.DateTimeFormat().resolvedOptions().timeZone || fallback;
