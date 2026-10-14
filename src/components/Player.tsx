"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { analyzeAudio } from "@/lib/analyze";
import { fmtTime } from "@/lib/format";
import { listenThreshold } from "@/lib/plans";
import { hideNowPlaying, onNowPlayingAction, showNowPlaying } from "@/lib/native-now-playing";
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
  time: number;
  duration: number;
  play: (t: PlayerTrack, queue?: PlayerTrack[]) => void;
  toggle: () => void;
  seek: (fraction: number) => void;
  seekBy: (seconds: number) => void;
};

const PlayerContext = createContext<Ctx | null>(null);
export const usePlayer = () => {
  const c = useContext(PlayerContext);
  if (!c) throw new Error("usePlayer outside PlayerProvider");
  return c;
};

export const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && !!el.closest("input, textarea, select, [contenteditable]");

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<PlayerTrack | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const queue = useRef<PlayerTrack[]>([]);
  // Seconds actually heard (seeks excluded) for the published "Listened" definition.
  const listened = useRef({ id: 0, secs: 0, last: 0, reported: false, duration: 0 as number | null });

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
    listened.current = { id: t.id, secs: 0, last: 0, reported: t.played, duration: t.duration };
    setCurrent(t);
    setTime(0);
    setDuration(t.duration ?? 0);
    a.src = `/api/tracks/${t.id}/audio`;
    void a.play().catch(() => setPlaying(false));
    if ("mediaSession" in navigator) {
      // Lock screen, Control Centre and headphones: title, artist and the FloorTest crest as artwork.
      navigator.mediaSession.metadata = new MediaMetadata({ title: t.title, artist: t.artist, album: "FloorTest", artwork: [{ src: "/icon.svg", sizes: "512x512", type: "image/svg+xml" }] });
    }
    if (!t.peaks) void backfill(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const a = new Audio();
    a.preload = "metadata";
    audio.current = a;
    const onTime = () => {
      setTime(a.currentTime);
      const l = listened.current;
      const delta = a.currentTime - l.last;
      if (delta > 0 && delta < 1.5) l.secs += delta;
      l.last = a.currentTime;
      const threshold = listenThreshold(l.duration || a.duration);
      if (!l.reported && l.secs >= threshold) {
        l.reported = true;
        fetch(`/api/tracks/${l.id}/listened`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ seconds: l.secs }),
        })
          .then((r) => r.json())
          .then((r) => r.first && router.refresh())
          .catch(() => (l.reported = false));
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
    a.addEventListener("loadedmetadata", () => {
      setDuration(a.duration);
      if (!listened.current.duration) listened.current.duration = a.duration;
    });
    a.addEventListener("ended", onEnded);
    // Skip between tracks in the current queue from the lock screen.
    const step = (by: number) => {
      const q = queue.current;
      const i = q.findIndex((t) => t.id === listened.current.id);
      const t = q[i + by];
      if (i >= 0 && t) start(t);
    };
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", () => void a.play());
      navigator.mediaSession.setActionHandler("pause", () => a.pause());
      navigator.mediaSession.setActionHandler("seekbackward", () => (a.currentTime = Math.max(0, a.currentTime - 10)));
      navigator.mediaSession.setActionHandler("seekforward", () => (a.currentTime = Math.min(a.duration, a.currentTime + 10)));
      navigator.mediaSession.setActionHandler("nexttrack", () => step(1));
      navigator.mediaSession.setActionHandler("previoustrack", () => step(-1));
    }
    // The Android app's notification player sends the same buttons.
    const stopNative = onNowPlayingAction((act) => (act === "play" ? void a.play() : act === "pause" ? a.pause() : step(act === "next" ? 1 : -1)));
    return () => {
      stopNative();
      hideNowPlaying();
      a.pause();
      a.src = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Android app: keep the notification player in step (title, play/pause, where we are). Progress runs on from here.
  useEffect(() => {
    if (!current) return;
    showNowPlaying({ title: current.title, artist: current.artist, playing, position: audio.current?.currentTime ?? 0, duration: duration || current.duration || 0 });
  }, [current, playing, duration]);

  const play = useCallback(
    (t: PlayerTrack, q?: PlayerTrack[]) => {
      if (q) queue.current = q;
      const a = audio.current!;
      if (current?.id === t.id) {
        if (a.paused) void a.play();
        else a.pause();
        return;
      }
      start(t);
    },
    [current, start],
  );

  const toggle = useCallback(() => {
    const a = audio.current;
    if (!a || !current) return;
    if (a.paused) void a.play();
    else a.pause();
  }, [current]);

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

  return (
    <PlayerContext.Provider value={{ current, playing, time, duration, play, toggle, seek, seekBy }}>{children}</PlayerContext.Provider>
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

export function PlayerBar() {
  const { current, playing, time, duration, toggle, seek } = usePlayer();
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
            <span className="shrink-0 text-[11px] text-faint tnum">{fmtTime(time)}</span>
          </span>
          <Waveform peaks={current.peaks} progress={d ? time / d : 0} duration={d} onSeek={seek} height={18} label={`Seek ${current.title}`} />
        </div>
        {/* A 44px tap area around the 28px button; the negative margin keeps the layout as drawn. */}
        <button
          onClick={toggle}
          className="-m-2 grid size-11 shrink-0 place-items-center"
          aria-label={playing ? `Pause ${current.title}` : `Play ${current.title}`}
        >
          <span className="grid size-7 place-items-center rounded-panel bg-white text-ink">
            <PlayIcon playing={playing} />
          </span>
        </button>
      </div>
    <div className="fixed inset-x-0 bottom-0 z-30 hidden border-t border-line bg-ink/95 backdrop-blur md:block">
      <div className="flex items-center gap-4 px-4 py-3">
        <button
          onClick={toggle}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lime text-ink"
          aria-label={playing ? `Pause ${current.title}` : `Play ${current.title}`}
        >
          <PlayIcon playing={playing} />
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
      </div>
    </div>
    </>
  );
}
