"use client";

/**
 * Offline kept tracks (phone apps only): the app keeps Prepare's kept tracks on the phone so the offline screen can play
 * them with no connection. The website has no OfflineCrate plugin, so here everything quietly does nothing.
 */
export type OfflineStatus = { count: number; syncing: boolean; done: number; total: number; owner?: number; syncedAt?: number };
type Progress = { done: number; total: number; finished?: boolean; saved?: number };
type Handle = { remove: () => unknown };
type Crate = {
  sync(o: { owner: number; maxDays: number; tracks: { id: number; title: string; artist: string; duration: number | null; url: string }[] }): Promise<{ started: boolean }>;
  status(): Promise<OfflineStatus>;
  clear(): Promise<void>;
  // A promise in Capacitor's own package, but the handle itself on pages loaded from the website: accept both.
  addListener(event: "progress", cb: (p: Progress) => void): Promise<Handle> | Handle;
};

function crate(): Crate | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { OfflineCrate?: Crate } } }).Capacitor;
  return cap?.isNativePlatform?.() ? (cap.Plugins?.OfflineCrate ?? null) : null;
}

export const offlineAvailable = () => !!crate();

export async function offlineStatus(): Promise<OfflineStatus | null> {
  try {
    return (await crate()?.status()) ?? null;
  } catch {
    return null;
  }
}

/** Asks the server what Prepare holds now and brings the phone's copy in line. Returns false if that couldn't start. */
export async function syncOffline(): Promise<boolean> {
  const c = crate();
  if (!c) return false;
  try {
    const res = await fetch("/api/offline/list", { cache: "no-store" });
    if (!res.ok) return false;
    const data = (await res.json()) as Parameters<Crate["sync"]>[0];
    await c.sync(data);
    return true;
  } catch {
    return false;
  }
}

export async function clearOffline() {
  try {
    await crate()?.clear();
  } catch {}
}

export function onOfflineProgress(cb: (p: Progress) => void) {
  const c = crate();
  if (!c) return () => {};
  let sub: Handle | null = null;
  let gone = false;
  try {
    void Promise.resolve(c.addListener("progress", cb))
      .then((s) => (gone ? s.remove() : (sub = s)))
      .catch(() => {});
  } catch {}
  return () => {
    gone = true;
    try {
      sub?.remove();
    } catch {}
  };
}
