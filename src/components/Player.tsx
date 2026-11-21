"use client";

import { useRenderProbe } from "@/lib/render-probe";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { analyzeAudio } from "@/lib/analyze";
import { fmtTime } from "@/lib/format";
import { LISTEN_BEAT_MS, listenThreshold } from "@/lib/plans";
import { hideNowPlaying, onNowPlayingAction, showNowPlaying } from "@/lib/native-now-playing";
import { SEEK_STEP } from "@/lib/media-session";
import { VOLUME_STEP, clampVolume, playerKey, saveVolume, savedVolume } from "@/lib/player-keys";
import { useMediaSession } from "@/lib/use-media-session";
import { isCharacterKey, overlayOpen, shortcutsOn } from "./useShortcuts";
import { Waveform } from "./Waveform";

export type PlayerTrack = {
  id: number;
  title: string;
  artist: string;
  peaks: number[] | null;
  duration: number | null;
  played: boolean;
  /**
   * Where the audio is, when it isn't a desk track (Projects: /api/music/<id>/audio). Such tracks aren't counted as
   * listened and have no waveform backfill; their `id` is negative so it never matches a desk track's.
   */
  src?: string;
  /** Kept, Not for me or neither, as the list that started it knew; the bar's heart reads it. Absent: nothing to decide. */
  decision?: "kept" | "passed" | null;
  /** The cover the players show: a link the server picked (lib/covers.ts playerCover). Absent or null: the placeholder. */
  cover?: string | null;
};

const audioUrl = (t: Pick<PlayerTrack, "id" | "src">) => t.src ?? `/api/tracks/${t.id}/audio`;

type Ctx = {
  current: PlayerTrack | null;
  playing: boolean;
  /** Asked to play but waiting for audio (a big WAV on a slow line): the play button shows a ring, not just Pause. */
  buffering: boolean;
  /** Not the playing position: that changes about 4 times a second, so it has its own store (usePlayerTime). */
  duration: number;
  play: (t: PlayerTrack, queue?: PlayerTrack[]) => void;
  toggle: () => void;
  seek: (fraction: number) => void;
  seekBy: (seconds: number) => void;
  /** The track after (1) or before (-1) the loaded one in the list it was started from. */
  skip: (by: 1 | -1) => void;
  hasNext: boolean;
  hasPrev: boolean;
  /** The tracks after the loaded one in the list it was started from, for the expanded player's Up next. */
  upNext: PlayerTrack[];
  /** A list or the bar decided a track: the loaded track and its queue take the new answer, so every heart agrees. */
  markDecision: (id: number, decision: "kept" | "passed" | null) => void;
  /** Goes up by one each time a track won't play (no connection, or the file is gone), so the bar can say so. */
  failures: number;
  /** The player's own volume (0–1) and mute, remembered on this device. Hardware volume keys are the device's. */
  volume: number;
  muted: boolean;
  /** Sets both, on the audio and remembered on this device (the bar's speaker button and slider). */
  setVolume: (volume: number, muted: boolean) => void;
  /** Goes up by one each time the volume or mute is changed, so the bar shows the note. */
  volumeTouched: number;
};

const PlayerContext = createContext<Ctx | null>(null);
export const usePlayer = () => {
  const c = useContext(PlayerContext);
  if (!c) throw new Error("usePlayer outside PlayerProvider");
  return c;
};

/**
 * Where the track is, in seconds, kept outside the player's context (speed fixes phase 1, 2 Nov). It moves about 4
 * times a second while a track plays; in the context it re-rendered every consumer (the review rail, whole track
 * lists) that often. Now only components that read it with usePlayerTime follow it.
 */
type TimeStore = { get: () => number; set: (t: number) => void; subscribe: (fn: () => void) => () => void };
function createTimeStore(): TimeStore {
  let time = 0;
  const listeners = new Set<() => void>();
  return {
    get: () => time,
    set: (t) => {
      if (t === time) return;
      time = t;
      for (const fn of listeners) fn();
    },
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
const PlayerTimeContext = createContext<TimeStore | null>(null);

/**
 * The playing position in seconds. `active` false (a row that isn't the loaded track) always reads 0, so that row
 * doesn't re-render while another track plays.
 */
export function usePlayerTime(active = true) {
  const store = useContext(PlayerTimeContext);
  if (!store) throw new Error("usePlayerTime outside PlayerProvider");
  return useSyncExternalStore(store.subscribe, () => (active ? store.get() : 0), () => 0);
}

/** A track's waveform with the player's progress on it while it's the loaded track (`on`); `length` in seconds. */
export function PlayerWaveform({ on, length, ...rest }: { on: boolean; length: number } & Omit<React.ComponentProps<typeof Waveform>, "progress" | "duration">) {
  const time = usePlayerTime(on);
  return <Waveform {...rest} progress={on && length ? time / length : 0} duration={length} />;
}

/** The playing position as m:ss, for the bar. */
export function PlayerClock({ className }: { className?: string }) {
  useRenderProbe("PlayerClock");
  return <span className={className}>{fmtTime(usePlayerTime())}</span>;
}

export const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && !!el.closest("input, textarea, select, [contenteditable]");

/** The shortest gap between two fresh-link retries after a playback error. */
const RELOAD_GAP_MS = 20_000;

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<PlayerTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [buffering, setBuffering] = useState(false);
  const [timeStore] = useState(createTimeStore);
  const [duration, setDuration] = useState(0);
  const [failures, setFailures] = useState(0);
  // The element itself, for the media keys (created in the effect below; the ref is for everything else).
  const [element, setElement] = useState<HTMLAudioElement | null>(null);
  const [volume, setVolumeState] = useState(1);
  const [muted, setMuted] = useState(false);
  const [volumeTouched, setVolumeTouched] = useState(0);
  // A play() refused for a real reason (not the browser's autoplay rule, not a newer track replacing this one).
  const refused = useCallback((e: unknown) => {
    const name = e instanceof DOMException ? e.name : "";
    if (name !== "NotAllowedError" && name !== "AbortError") setFailures((n) => n + 1);
  }, []);
  const queue = useRef<PlayerTrack[]>([]);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrev, setHasPrev] = useState(false);
  const [upNext, setUpNext] = useState<PlayerTrack[]>([]);
  // Which neighbours the loaded track has in its queue, for the bar's Previous and Next.
  const syncNeighbours = useCallback((id: number) => {
    const i = queue.current.findIndex((t) => t.id === id);
    setHasPrev(i > 0);
    setHasNext(i >= 0 && i < queue.current.length - 1);
    setUpNext(i >= 0 ? queue.current.slice(i + 1) : []);
  }, []);
  // "Listened" is counted by the server: the player says when a track starts or resumes ("play") and checks in about
  // every 10 s of sound actually heard ("beat"; seeks excluded). The server credits real time only (src/lib/review.ts).
  const listened = useRef({ id: 0, src: "", last: 0, sinceBeat: 0, reported: false, duration: 0 as number | null });
  const reportListen = useCallback(
    (event: "play" | "beat") => {
      const l = listened.current;
      if (l.reported || !l.id) return;
      fetch(`/api/tracks/${l.id}/listened`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event }) })
        .then((r) => r.json())
        .then((r: { first?: boolean }) => {
          if (r.first && listened.current === l) {
            l.reported = true;
            router.refresh();
          }
        })
        .catch(() => {});
    },
    [router],
  );

  // Tracks uploaded without browser analysis get their waveform the first time the receiver plays them.
  const backfill = useCallback(
    async (t: PlayerTrack) => {
      const blob = await fetch(`/api/tracks/${t.id}/audio`).then((r) => (r.ok ? r.blob() : null));
      const res = blob && (await analyzeAudio(new File([blob], "track")));
      if (!res) return;
      setCurrent((c) => (c?.id === t.id ? { ...c, peaks: res.peaks, duration: c.duration ?? res.duration } : c));
      await fetch(`/api/tracks/${t.id}/analysis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(res),
      });
      router.refresh();
    },
    [router],
  );

  const start = useCallback((t: PlayerTrack) => {
    const a = audio.current!;
    // A track with its own src (Projects) is never reported as listened: there is nobody's track to mark.
    listened.current = { id: t.id, src: audioUrl(t), last: 0, sinceBeat: 0, reported: t.played || !!t.src, duration: t.duration };
    setCurrent(t);
    syncNeighbours(t.id);
    timeStore.set(0);
    setDuration(t.duration ?? 0);
    a.src = audioUrl(t);
    // A new source always has to load first; "playing" clears this once sound actually starts.
    setBuffering(true);
    void a.play().catch((e) => {
      setPlaying(false);
      setBuffering(false);
      refused(e);
    });
    if (!t.peaks && !t.src) void backfill(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Skip between tracks in the current queue (media keys, lock screen, the Android notification). A ref read, so it
  // always acts on the queue and track loaded now.
  const step = useCallback(
    (by: number) => {
      const q = queue.current;
      const i = q.findIndex((t) => t.id === listened.current.id);
      const t = q[i + by];
      if (i >= 0 && t) start(t);
    },
    [start],
  );

  useEffect(() => {
    const a = new Audio();
    a.preload = "metadata";
    const saved = savedVolume();
    a.volume = saved.volume;
    a.muted = saved.muted;
    audio.current = a;
    setElement(a);
    setVolumeState(saved.volume);
    setMuted(saved.muted);
    const onTime = () => {
      timeStore.set(a.currentTime);
      const l = listened.current;
      const delta = a.currentTime - l.last;
      if (delta > 0 && delta < 1.5) l.sinceBeat += delta;
      l.last = a.currentTime;
      // Every 10 s, or sooner for a short track, so one that lasts under 10 s can still reach its threshold.
      const every = Math.min(LISTEN_BEAT_MS, listenThreshold(l.duration || a.duration) * 1000);
      if (!l.reported && l.sinceBeat * 1000 >= every) {
        l.sinceBeat = 0;
        reportListen("beat");
      }
    };
    const onEnded = () => {
      const q = queue.current;
      const i = q.findIndex((t) => t.id === listened.current.id);
      if (i >= 0 && i < q.length - 1) start(q[i + 1]);
      else setPlaying(false);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", () => setPlaying(true));
    a.addEventListener("pause", () => setPlaying(false));
    // "play" fires as soon as playback is asked for, before any sound; "waiting" means it's stalled on data.
    a.addEventListener("waiting", () => setBuffering(true));
    for (const ev of ["playing", "canplay", "pause", "ended", "error"]) a.addEventListener(ev, () => setBuffering(false));
    a.addEventListener("loadedmetadata", () => setDuration(a.duration));
    // Sound has started (or resumed): the server starts the clock without crediting the pause before it.
    a.addEventListener("playing", () => reportListen("play"));
    a.addEventListener("ended", onEnded);
    // The storage link lasts 5 minutes (src/lib/file-access.ts). When it runs out mid-track (a long set, or paused a
    // while), the next chunk fails: ask the app for a fresh link and carry on from the same spot. At most once every
    // RELOAD_GAP_MS, so a track that's really gone (deleted, or access removed) stops instead of looping.
    let lastReload = 0;
    a.addEventListener("error", () => {
      const id = listened.current.id;
      if (!id || !a.error) return;
      // Already tried a fresh link moments ago: the track really won't play. Say so instead of stopping silently.
      if (Date.now() - lastReload < RELOAD_GAP_MS) return setFailures((n) => n + 1);
      lastReload = Date.now();
      const at = a.currentTime;
      const resume = !a.paused;
      a.src = listened.current.src || `/api/tracks/${id}/audio`;
      a.addEventListener("loadedmetadata", () => (a.currentTime = at), { once: true });
      if (resume) void a.play().catch(() => setPlaying(false));
    });
    // The apps' lock screen / notification player sends the same buttons as the media keys, plus the scrubber.
    const stopNative = onNowPlayingAction((act, position) => {
      if (act === "play") void a.play().catch(() => setPlaying(false));
      else if (act === "pause") a.pause();
      else if (act === "seek") {
        if (typeof position === "number" && Number.isFinite(position)) a.currentTime = Math.max(0, position);
      } else step(act === "next" ? 1 : -1);
    });
    return () => {
      stopNative();
      hideNowPlaying();
      a.pause();
      a.src = "";
      setElement(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Media keys, headphone buttons, lock screen, Control Centre, Touch Bar (src/lib/media-session.ts).
  useMediaSession({
    audio: element,
    meta: current ? { title: current.title, artist: current.artist, cover: current.cover } : null,
    play: () => {
      if (listened.current.id) void audio.current?.play().catch(refused);
    },
    onNext: () => step(1),
    onPrev: () => step(-1),
  });

  // The apps: keep the lock screen / notification player in step (title, cover, play/pause, where we are). Progress
  // runs on from here; a seek (here or on the lock screen) sends the new spot.
  const [seekedAt, setSeekedAt] = useState(0);
  useEffect(() => {
    if (!element) return;
    const onSeeked = () => setSeekedAt(Date.now());
    element.addEventListener("seeked", onSeeked);
    return () => element.removeEventListener("seeked", onSeeked);
  }, [element]);
  useEffect(() => {
    if (!current) return;
    showNowPlaying({ title: current.title, artist: current.artist, cover: current.cover, playing, position: audio.current?.currentTime ?? 0, duration: duration || current.duration || 0 });
  }, [current, playing, duration, seekedAt]);

  const play = useCallback(
    (t: PlayerTrack, q?: PlayerTrack[]) => {
      if (q) queue.current = q;
      const a = audio.current!;
      // The track loaded right now (a ref, so a play() from an older render, like a decision's rollback, sees it too).
      if (listened.current.id === t.id) {
        if (q) syncNeighbours(t.id);
        if (a.paused) void a.play().catch(refused);
        else a.pause();
        return;
      }
      start(t);
    },
    [start, refused, syncNeighbours],
  );

  const markDecision = useCallback((id: number, decision: "kept" | "passed" | null) => {
    queue.current = queue.current.map((t) => (t.id === id && "decision" in t ? { ...t, decision } : t));
    setCurrent((c) => (c?.id === id && "decision" in c ? { ...c, decision } : c));
  }, []);

  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a || !current) return;
    if (a.paused) void a.play().catch(refused);
    else a.pause();
  }, [current, refused]);

  const seek = useCallback((f: number) => {
    const a = audio.current;
    if (!a || !a.duration) return;
    a.currentTime = f * a.duration;
    listened.current.last = a.currentTime;
  }, []);

  const seekBy = useCallback((s: number) => {
    const a = audio.current;
    if (!a || !a.duration) return;
    a.currentTime = Math.min(a.duration, Math.max(0, a.currentTime + s));
    listened.current.last = a.currentTime;
  }, []);

  const changeVolume = useCallback((v: number, m: boolean) => {
    const a = audio.current;
    const next = clampVolume(v);
    if (a) {
      a.volume = next;
      a.muted = m;
    }
    setVolumeState(next);
    setMuted(m);
    setVolumeTouched((n) => n + 1);
    saveVolume(next, m);
  }, []);

  // The desk's player keys, on every dashboard page while a track is loaded (src/lib/player-keys.ts). The Review Queue
  // and List handle Space and ← / → themselves (they act on the open track), marked by [data-player-keys]; this adds
  // Shift+↑ / Shift+↓ volume and M mute there, and all of them elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!current || e.defaultPrevented || overlayOpen()) return;
      const k = playerKey(e, { volumeNeedsShift: true });
      if (!k) return;
      if (isCharacterKey(e) && !shortcutsOn()) return;
      const pageOwns = !!document.querySelector("[data-player-keys]");
      const a = audio.current;
      if (k === "toggle" && !pageOwns) toggle();
      else if (k === "back" && !pageOwns) seekBy(-SEEK_STEP);
      else if (k === "forward" && !pageOwns) seekBy(SEEK_STEP);
      else if (k === "louder" || k === "quieter") changeVolume((a?.volume ?? volume) + (k === "louder" ? VOLUME_STEP : -VOLUME_STEP), false);
      else if (k === "mute") changeVolume(a?.volume ?? volume, !(a?.muted ?? muted));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, toggle, seekBy, changeVolume, volume, muted]);

  // One stable value: a new object each render reached the dashboard's still-hydrating Suspense boundary (loading.tsx)
  // during the mount effect below, so React re-rendered the page and its hidden streamed copy briefly sat beside the
  // visible one (1 Nov; scratchpad dupe probe). Hydrating the server HTML also shows the page sooner. The time is not
  // in it (its own store, usePlayerTime), so playing changes this only on play, pause, buffering or a new track.
  const value = useMemo(
    () => ({ current, playing, buffering, duration, play, toggle, seek, seekBy, skip: step, hasNext, hasPrev, upNext, markDecision, failures, volume, muted, setVolume: changeVolume, volumeTouched }),
    [current, playing, buffering, duration, play, toggle, seek, seekBy, step, hasNext, hasPrev, upNext, markDecision, failures, volume, muted, changeVolume, volumeTouched],
  );
  return (
    <PlayerContext.Provider value={value}>
      <PlayerTimeContext.Provider value={timeStore}>{children}</PlayerTimeContext.Provider>
    </PlayerContext.Provider>
  );
}

export function PlayIcon({ playing, className = "h-4 w-4" }: { playing: boolean; className?: string }) {
  return playing ? (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <rect x="3" y="2" width="3.5" height="12" rx="1" />
      <rect x="9.5" y="2" width="3.5" height="12" rx="1" />
    </svg>
  ) : (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M4 2.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 4 2.5Z" />
    </svg>
  );
}

/**
 * The buffering ring: a 2px arc turning around a play button while audio loads. It sits inside the button (which
 * needs `relative` and `data-buffering` while loading) and fades in after 150ms, so a fast start never flashes it.
 */
export function BufferRing({ className = "-inset-1" }: { className?: string }) {
  return <span aria-hidden data-buffer-ring className={`pointer-events-none absolute rounded-full ${className}`} />;
}
