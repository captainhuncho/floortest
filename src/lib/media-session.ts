/**
 * Media keys, headphone buttons, the lock screen, Control Centre and the Touch Bar talk to a page through the browser's
 * Media Session (Chrome, Edge, Safari, Firefox). This file binds one audio element to it: what's playing, the buttons,
 * play/pause state and the position, kept in step as the audio plays and seeks. Plain functions so they can be tested
 * without a browser; `use-media-session.ts` is the React hook around them.
 *
 * Hardware volume keys change the device's volume. A page can't read or catch them, and shouldn't: they stay the
 * system's. The players' own volume is the in-page ↑/↓ (see `player-keys.ts`).
 */

/** Seconds moved by the seek-back / seek-forward buttons and by ← / →. */
export const SEEK_STEP = 10;

export const MEDIA_ACTIONS = ["play", "pause", "stop", "seekbackward", "seekforward", "seekto", "previoustrack", "nexttrack"] as const;
export type MediaAction = (typeof MEDIA_ACTIONS)[number];

/** The part of navigator.mediaSession used here (a stub in tests). */
export type SessionLike = {
  metadata: unknown;
  playbackState: "none" | "paused" | "playing";
  setActionHandler(action: MediaAction, handler: ((details: { seekTime?: number; seekOffset?: number; fastSeek?: boolean }) => void) | null): void;
  setPositionState?(state?: { duration: number; position: number; playbackRate: number }): void;
};

/** The part of an audio element used here. */
export type AudioLike = {
  currentTime: number;
  duration: number;
  paused: boolean;
  ended?: boolean;
  playbackRate: number;
  play(): Promise<void> | void;
  pause(): void;
  fastSeek?(time: number): void;
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
};

export type BindOptions = {
  /** Start or resume (defaults to audio.play(), errors ignored). The desk counts a refused play as a failure. */
  play?: () => void;
  /** Next / previous track. Leave out where there's no list (the moderation player): the OS then hides the buttons. */
  next?: () => void;
  previous?: () => void;
};

export function mediaSession(): SessionLike | null {
  if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return null;
  return navigator.mediaSession as unknown as SessionLike;
}

/** Each action fenced: a browser that doesn't know one (older Safari and "stop", say) throws, and that's fine. */
function setHandler(s: SessionLike, action: MediaAction, handler: Parameters<SessionLike["setActionHandler"]>[1]) {
  try {
    s.setActionHandler(action, handler);
  } catch {}
}

const finite = (n: number) => Number.isFinite(n) && n > 0;

/** Moves the audio to `t` seconds, inside the track. */
export function seekAudio(a: AudioLike, t: number, fast = false) {
  const end = finite(a.duration) ? a.duration : Infinity;
  const to = Math.min(end, Math.max(0, t));
  if (fast && a.fastSeek) a.fastSeek(to);
  else a.currentTime = to;
}

/** Tells the system where the track is, so the lock screen's scrubber and time are right. Needs a known length. */
export function syncPosition(s: SessionLike, a: AudioLike) {
  if (!s.setPositionState || !finite(a.duration)) return;
  try {
    s.setPositionState({ duration: a.duration, position: Math.min(a.duration, Math.max(0, a.currentTime || 0)), playbackRate: a.playbackRate || 1 });
  } catch {}
}

export function syncState(s: SessionLike, a: AudioLike) {
  try {
    s.playbackState = a.paused ? "paused" : "playing";
  } catch {}
}

/** The events after which the system's picture of the track can be wrong. Not timeupdate: it runs the clock itself. */
const POSITION_EVENTS = ["loadedmetadata", "durationchange", "ratechange", "seeked", "play", "pause", "playing", "ended"];

/**
 * Hands the media buttons to `a`. Returns the undo: every handler back to null, state "none", no metadata and no
 * position, so a player that's gone doesn't keep the keys.
 */
export function bindMediaSession(s: SessionLike, a: AudioLike, o: BindOptions = {}) {
  const play = o.play ?? (() => void Promise.resolve(a.play()).catch(() => {}));
  setHandler(s, "play", () => play());
  setHandler(s, "pause", () => a.pause());
  setHandler(s, "stop", () => {
    a.pause();
    seekAudio(a, 0);
  });
  setHandler(s, "seekbackward", (d) => seekAudio(a, a.currentTime - (d.seekOffset || SEEK_STEP)));
  setHandler(s, "seekforward", (d) => seekAudio(a, a.currentTime + (d.seekOffset || SEEK_STEP)));
  setHandler(s, "seekto", (d) => {
    if (typeof d.seekTime === "number") seekAudio(a, d.seekTime, !!d.fastSeek);
  });
  setHandler(s, "nexttrack", o.next ? () => o.next!() : null);
  setHandler(s, "previoustrack", o.previous ? () => o.previous!() : null);

  const onChange = () => {
    syncState(s, a);
    syncPosition(s, a);
  };
  for (const ev of POSITION_EVENTS) a.addEventListener(ev, onChange);
  onChange();

  return () => {
    for (const ev of POSITION_EVENTS) a.removeEventListener(ev, onChange);
    for (const action of MEDIA_ACTIONS) setHandler(s, action, null);
    try {
      s.playbackState = "none";
      s.metadata = null;
      s.setPositionState?.();
    } catch {}
  };
}

export type MediaMeta = { title: string; artist?: string | null };

/** Title and artist for the lock screen, with the FloorTest crest as artwork. Null clears it. */
export function setMetadata(s: SessionLike, meta: MediaMeta | null) {
  try {
    s.metadata =
      meta && typeof MediaMetadata !== "undefined"
        ? new MediaMetadata({ title: meta.title, artist: meta.artist ?? "", album: "FloorTest", artwork: [{ src: "/icon.svg", sizes: "512x512", type: "image/svg+xml" }] })
        : null;
  } catch {}
}
