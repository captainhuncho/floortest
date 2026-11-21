"use client";

/**
 * The apps' system media player. Android's WebView doesn't show the lock screen / notification player, and the iPhone
 * app's web view shows the title but not the buttons, so both apps have a small NowPlaying plugin that does. The web
 * player tells it what's playing and listens for the buttons. The iPhone app also gets the cover (fetched here, with the
 * page's own sign-in, and handed over as image data). On the website there's no plugin and these do nothing.
 */
export type NowPlayingAction = "play" | "pause" | "next" | "previous" | "seek";
type Handle = { remove: () => unknown };
type Update = { title: string; artist: string; playing: boolean; position: number; duration: number; artwork?: string };
type Plugin = {
  update(o: Update): Promise<void>;
  stop(): Promise<void>;
  // A promise in Capacitor's own package, but the handle itself on pages loaded from the website: accept both.
  addListener(event: "action", cb: (e: { action: NowPlayingAction; position?: number }) => void): Promise<Handle> | Handle;
};
type Cap = { isNativePlatform?: () => boolean; getPlatform?: () => string; Plugins?: { NowPlaying?: Plugin } };

/** Shown when a track has no cover: the FloorTest crest. */
export const FALLBACK_COVER = "/brand/icon-512.png";
/** A cover bigger than this isn't sent (the players' covers are thumbnails). */
const MAX_COVER_BYTES = 1024 * 1024;

function cap(): Cap | null {
  if (typeof window === "undefined") return null;
  const c = (window as unknown as { Capacitor?: Cap }).Capacitor;
  return c?.isNativePlatform?.() ? c : null;
}

function plugin(): Plugin | null {
  return cap()?.Plugins?.NowPlaying ?? null;
}

/** Only the iPhone plugin shows a cover; Android's notification doesn't take one. */
const wantsCover = () => cap()?.getPlatform?.() === "ios";

let coverFor: string | null = null;

/** The cover as a data URL, read with the page's own sign-in. Null when it can't be read or is too big. */
export async function coverData(src: string, fetcher: typeof fetch = fetch): Promise<string | null> {
  const res = await fetcher(src, { credentials: "same-origin", signal: AbortSignal.timeout(8000) });
  if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) return null;
  const blob = await res.blob();
  if (blob.size > MAX_COVER_BYTES) return null;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type || "image/png"};base64,${btoa(binary)}`;
}

// Never let the phone's player break the page: every call is fenced off.
function send(o: Update) {
  try {
    void Promise.resolve(plugin()?.update(o)).catch(() => {});
  } catch {}
}

/** What's playing. `cover` is the player's cover link (null: the crest); the iPhone app gets it once per change. */
export function showNowPlaying(o: Omit<Update, "artwork"> & { cover?: string | null }) {
  const { cover, ...rest } = o;
  send(rest);
  if (!wantsCover()) return;
  const src = cover || FALLBACK_COVER;
  if (src === coverFor) return;
  coverFor = src;
  void coverData(src)
    .catch(() => null)
    .then((artwork) => {
      // Moved on to another track meanwhile: that one's cover is on its way instead.
      if (artwork && coverFor === src) send({ ...rest, artwork });
    });
}

export function hideNowPlaying() {
  coverFor = null;
  try {
    void Promise.resolve(plugin()?.stop()).catch(() => {});
  } catch {}
}

/** Buttons pressed on the notification or lock screen ("seek" carries the scrubber's position). Returns a function that stops listening. */
export function onNowPlayingAction(handle: (a: NowPlayingAction, position?: number) => void) {
  const p = plugin();
  if (!p) return () => {};
  let sub: Handle | null = null;
  let gone = false;
  try {
    void Promise.resolve(p.addListener("action", (e) => handle(e.action, e.position)))
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
