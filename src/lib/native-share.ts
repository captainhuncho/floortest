"use client";

/**
 * Share to FloorTest (iOS app only): files shared into the app from Files, Dropbox, WeTransfer and so on wait in the app's
 * inbox until they're sent. The Send page reads them here as ordinary Files, so the usual form (tags, analysis, upload) takes over.
 * On the website there's no inbox and everything here quietly returns nothing.
 */
type SharedEntry = { id: string; name: string; size: number };
type Inbox = {
  list(): Promise<{ files: SharedEntry[] }>;
  read(o: { id: string; offset: number; length: number }): Promise<{ data: string }>;
  remove(o: { id: string }): Promise<void>;
};

const CHUNK = 2 * 1024 * 1024;

function inbox(): Inbox | null {
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { ShareInbox?: Inbox } } }).Capacitor;
  return cap?.isNativePlatform?.() ? (cap.Plugins?.ShareInbox ?? null) : null;
}

export type SharedFile = { id: string; file: File };

/** The audio files waiting in the app's share inbox, read into Files (in 2 MB pieces over the app bridge). */
export async function sharedFiles(): Promise<SharedFile[]> {
  const box = inbox();
  if (!box) return [];
  try {
    const { files } = await box.list();
    const out: SharedFile[] = [];
    for (const f of files) {
      const parts: Uint8Array<ArrayBuffer>[] = [];
      for (let offset = 0; offset < f.size; offset += CHUNK) {
        const { data } = await box.read({ id: f.id, offset, length: Math.min(CHUNK, f.size - offset) });
        const bin = atob(data);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        parts.push(bytes);
      }
      out.push({ id: f.id, file: new File(parts, f.name, { type: /\.mp3$/i.test(f.name) ? "audio/mpeg" : "audio/wav" }) });
    }
    return out;
  } catch {
    return [];
  }
}

/** Takes files out of the inbox (once sent, or when the sender removes them). */
export async function clearShared(ids: string[]) {
  const box = inbox();
  if (!box) return;
  for (const id of ids) await box.remove({ id }).catch(() => {});
}

/** Empties the inbox (on sign-out), so a file shared on this phone never waits for the next account's Send form. */
export async function clearAllShared() {
  const box = inbox();
  if (!box) return;
  try {
    const { files } = await box.list();
    await clearShared(files.map((f) => f.id));
  } catch {}
}
