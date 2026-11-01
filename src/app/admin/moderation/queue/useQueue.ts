"use client";

import { useCallback, useState, useSyncExternalStore, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { QueueRow } from "./model";

/** Whether a media query matches. The server and the first paint say `server`; the browser's answer follows at once. */
export function useMedia(query: string, server: boolean) {
  const subscribe = useCallback(
    (on: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", on);
      return () => m.removeEventListener("change", on);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => server);
}

/** The chosen row's address: a track by its id, a held upload by its own; the search stays. */
export function rowHref(path: string, search: string, row: QueueRow | null) {
  const p = new URLSearchParams(search ? { q: search } : {});
  if (row?.track_id) p.set("t", String(row.track_id));
  else if (row) p.set("u", row.key.slice(row.key.indexOf(":") + 1));
  const s = p.toString();
  return s ? `${path}?${s}` : path;
}

/**
 * The chosen row. It changes at once on a click or a key; the page then asks the server for that track's details
 * (player, sender, history) without a full reload. Set here, never in an effect, so the first render is the only one.
 */
export function useChosen(initial: string | null, search: string) {
  const [chosen, setChosen] = useState<string | null>(initial);
  const [loading, start] = useTransition();
  const router = useRouter();
  const path = usePathname();
  const choose = useCallback(
    (row: QueueRow | null, navigate = true) => {
      setChosen(row?.key ?? null);
      if (navigate) start(() => router.replace(rowHref(path, search, row), { scroll: false }));
    },
    [router, search, path],
  );
  return { chosen, choose, loading };
}

/** Waits, so a "✓ Kept" can be seen before the next row opens. */
export const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
