"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { analyzeAudio } from "@/lib/analyze";
import { fmtTime } from "@/lib/format";
import { LISTEN_BEAT_MS, listenThreshold } from "@/lib/plans";
import { hideNowPlaying, onNowPlayingAction, showNowPlaying } from "@/lib/native-now-playing";
import { SEEK_STEP } from "@/lib/media-session";
import { VOLUME_STEP, clampVolume, playerKey, saveVolume, savedVolume } from "@/lib/player-keys";
import { useMediaSession } from "@/lib/use-media-session";
import { isCharacterKey, overlayOpen, shortcutsOn } from "./useShortcuts";
import { useToast } from "./Toast";
import { VolumeNote } from "./VolumeNote";
import { Waveform } from "./Waveform";

export type PlayerTrack = {
  id: number;
  title: string;
  artist: string;
  peaks: number[] | null;
  duration: number | null;
  played: boolean;
};

type Ctx = {
  current: PlayerTrack | null;
  playing: boolean;
  /** Asked to play but waiting for audio (a big WAV on a slow line): the play button shows a ring, not just Pause. */
  buffering: boolean;
  time: number;
  duration: number;
  play: (t: PlayerTrack, queue?: PlayerTrack[]) => void;
  toggle: () => void;
  seek: (fraction: number) => void;
  seekBy: (seconds: number) => void;
  /** Goes up by one each time a track won't play (no connection, or the file is gone), so the bar can say so. */
  failures: number;
  /** The player's own volume (0–1) and mute, remembered on this device. Hardware volume keys are the device's. */
  volume: number;
  muted: boolean;
  /** Goes up by one each time the volume or mute is changed from the keyboard, so the bar shows the note. */
  volumeTouched: number;
};

const PlayerContext = createContext<Ctx | null>(null);
export const usePlayer = () => {
  const c = useContext(PlayerContext);
  if (!c) throw new Error("usePlayer outside PlayerProvider");
  return c;
};

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
  const [time, setTime] = useState(0);
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
  // "Listened" is counted by the server: the player says when a track starts or resumes ("play") and checks in about
  // every 10 s of sound actually heard ("beat"; seeks excluded). The server credits real time only (src/lib/review.ts).
  const listened = useRef({ id: 0, last: 0, sinceBeat: 0, reported: false, duration: 0 as number | null });
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
    listened.current = { id: t.id, last: 0, sinceBeat: 0, reported: t.played, duration: t.duration };
    setCurrent(t);
    setTime(0);
    setDuration(t.duration ?? 0);
    a.src = `/api/tracks/${t.id}/audio`;
    // A new source always has to load first; "playing" clears this once sound actually starts.
    setBuffering(true);
    void a.play().catch((e) => {
      setPlaying(false);
      setBuffering(false);
      refused(e);
    });
    if (!t.peaks) void backfill(t);
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
      setTime(a.currentTime);
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
      a.src = `/api/tracks/${id}/audio`;
      a.addEventListener("loadedmetadata", () => (a.currentTime = at), { once: true });
      if (resume) void a.play().catch(() => setPlaying(false));
    });
    // The Android app's notification player sends the same buttons as the media keys.
    const stopNative = onNowPlayingAction((act) => (act === "play" ? void a.play() : act === "pause" ? a.pause() : step(act === "next" ? 1 : -1)));
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
    meta: current ? { title: current.title, artist: current.artist } : null,
    play: () => {
      if (listened.current.id) void audio.current?.play().catch(refused);
    },
    onNext: () => step(1),
    onPrev: () => step(-1),
  });

  // Android app: keep the notification player in step (title, play/pause, where we are). Progress runs on from here.
  useEffect(() => {
    if (!current) return;
    showNowPlaying({ title: current.title, artist: current.artist, playing, position: audio.current?.currentTime ?? 0, duration: duration || current.duration || 0 });
  }, [current, playing, duration]);

  const play = useCallback(
    (t: PlayerTrack, q?: PlayerTrack[]) => {
      if (q) queue.current = q;
      const a = audio.current!;
      // The track loaded right now (a ref, so a play() from an older render, like a decision's rollback, sees it too).
      if (listened.current.id === t.id) {
        if (a.paused) void a.play().catch(refused);
        else a.pause();
        return;
      }
      start(t);
    },
    [start, refused],
  );

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
  // visible one (1 Nov; scratchpad dupe probe). Hydrating the server HTML also shows the page sooner.
  const value = useMemo(
    () => ({ current, playing, buffering, time, duration, play, toggle, seek, seekBy, failures, volume, muted, volumeTouched }),
    [current, playing, buffering, time, duration, play, toggle, seek, seekBy, failures, volume, muted, volumeTouched],
  );
  return (
    <PlayerContext.Provider value={value}>
      {children}
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

export function PlayerBar() {
  const { current, playing, buffering, time, duration, toggle, seek, failures, volume, muted, volumeTouched } = usePlayer();
  const toast = useToast();
  useEffect(() => {
    if (failures) toast.show({ message: "This track won't play right now. Check your connection, then press play again.", tone: "error" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per failure, not when the toast API changes
  }, [failures]);
  if (!current) return null;
  const d = duration || current.duration || 0;
  return (
    <>
      {/* Phones (Figma "Mini Player"): floats above the tab bar and stays put across screens. */}
      <div data-mini-player className="fixed inset-x-4 bottom-[calc(max(1rem,env(safe-area-inset-bottom))+72px)] z-30 flex items-center gap-3 rounded-2xl border border-ink-4 bg-ink p-3 md:hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/mini-art.svg" alt="" className="size-11 shrink-0" />
        {/* The title opens the track; the waveform beside it only seeks, so one tap never does both. */}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="flex items-center justify-between gap-2">
            <Link href={`/dashboard/review?view=queue&s=all&t=${current.id}`} className="truncate text-sm font-bold tracking-[-0.4px] text-bone">
              {current.title}
            </Link>
            <span className="flex shrink-0 items-center gap-2">
              <VolumeNote volume={volume} muted={muted} touched={volumeTouched} />
              <span className="text-[11px] text-faint tnum">{fmtTime(time)}</span>
            </span>
          </span>
          <Waveform peaks={current.peaks} progress={d ? time / d : 0} duration={d} onSeek={seek} height={18} label={`Seek ${current.title}`} />
        </div>
        {/* A 44px tap area around the 28px button; the negative margin keeps the layout as drawn. */}
        <button
          onClick={toggle}
          className="-m-2 grid size-11 shrink-0 place-items-center"
          aria-label={playing ? `Pause ${current.title}` : `Play ${current.title}`}
          aria-busy={buffering || undefined}
          data-buffering={buffering ? "" : undefined}
        >
          <span className="relative grid size-7 place-items-center rounded-panel bg-white text-ink">
            <PlayIcon playing={playing} />
            <BufferRing className="-inset-[5px] text-bone" />
          </span>
        </button>
      </div>
    <div data-player-bar className="fixed inset-x-0 bottom-0 z-30 hidden border-t border-line bg-ink/95 backdrop-blur md:block">
      <div className="flex items-center gap-4 px-4 py-3">
        <button
          onClick={toggle}
          className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lime text-ink"
          aria-label={playing ? `Pause ${current.title}` : `Play ${current.title}`}
          aria-busy={buffering || undefined}
          data-buffering={buffering ? "" : undefined}
        >
          <PlayIcon playing={playing} />
          <BufferRing className="-inset-[5px] text-lime" />
        </button>
        <Link href={`/dashboard/review?view=queue&s=all&t=${current.id}`} className="w-40 min-w-0 shrink-0 sm:w-56">
          <p className="truncate text-sm font-medium">{current.title}</p>
          <p className="truncate text-sm text-mute">{current.artist}</p>
        </Link>
        <span className="hidden text-sm text-mute tnum sm:block">{fmtTime(time)}</span>
        <div className="min-w-0 flex-1">
          <Waveform peaks={current.peaks} progress={d ? time / d : 0} duration={d} onSeek={seek} height={32} label={`Seek ${current.title}`} />
        </div>
        <span className="hidden text-sm text-mute tnum sm:block">{fmtTime(d)}</span>
        <VolumeNote volume={volume} muted={muted} touched={volumeTouched} className="w-20 text-right" />
      </div>
    </div>
    </>
  );
}
