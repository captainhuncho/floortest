"use client";

/**
 * Android app only: Android's WebView doesn't show the system media player (lock screen, notification) the way Chrome
 * and iOS do, so the app has a small NowPlaying plugin that does. The web player tells it what's playing and listens for
 * the notification's buttons. Elsewhere (website, iPhone app) there's no plugin and these do nothing.
 */
type Action = "play" | "pause" | "next" | "previous";
type Handle = { remove: () => unknown };
type Plugin = {
  update(o: { title: string; artist: string; playing: boolean; position: number; duration: number }): Promise<void>;
  stop(): Promise<void>;
  // A promise in Capacitor's own package, but the handle itself on pages loaded from the website: accept both.
  addListener(event: "action", cb: (e: { action: Action }) => void): Promise<Handle> | Handle;
};

function plugin(): Plugin | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; Plugins?: { NowPlaying?: Plugin } } }).Capacitor;
  return cap?.isNativePlatform?.() ? (cap.Plugins?.NowPlaying ?? null) : null;
}

// Never let the phone's player break the page: every call is fenced off.
export function showNowPlaying(o: { title: string; artist: string; playing: boolean; position: number; duration: number }) {
  try {
    void Promise.resolve(plugin()?.update(o)).catch(() => {});
  } catch {}
}

export function hideNowPlaying() {
  try {
    void Promise.resolve(plugin()?.stop()).catch(() => {});
  } catch {}
}

/** Buttons pressed on the notification or lock screen. Returns a function that stops listening. */
export function onNowPlayingAction(handle: (a: Action) => void) {
  const p = plugin();
  if (!p) return () => {};
  let sub: Handle | null = null;
  let gone = false;
  try {
    void Promise.resolve(p.addListener("action", (e) => handle(e.action)))
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
