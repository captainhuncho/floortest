"use client";

import { useCallback, useRef, useState } from "react";
import { Waveform } from "@/components/Waveform";
import { fmtTime } from "@/lib/format";
import { useMediaSession } from "@/lib/use-media-session";

/**
 * Moderation → listen to a reported track (owner, 1 Nov 2026). Nothing loads until Play, so opening a track doesn't
 * count as listening; each play is written to the admin log by /api/admin/tracks/[id]/audio. Media keys and the lock
 * screen play, pause and seek it once it has played (no next / previous: one disputed track at a time).
 */
export function ModerationPlayer({ id, title, artist, peaks, duration }: { id: number; title: string; artist: string | null; peaks: number[] | null; duration: number | null }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [element, setElement] = useState<HTMLAudioElement | null>(null);
  const attach = useCallback((el: HTMLAudioElement | null) => {
    audio.current = el;
    setElement(el);
  }, []);
  const [playing, setPlaying] = useState(false);
  const [at, setAt] = useState(0);
  const [len, setLen] = useState(duration ?? 0);
  const [failed, setFailed] = useState(false);

  const start = () => {
    const a = audio.current;
    if (!a) return;
    if (!a.src) a.src = `/api/admin/tracks/${id}/audio`;
    a.play().catch(() => setFailed(true));
  };
  const toggle = () => {
    const a = audio.current;
    if (!a) return;
    if (a.paused) start();
    else a.pause();
  };
  useMediaSession({ audio: element, meta: { title, artist }, play: start });
  const seek = (f: number) => {
    const a = audio.current;
    if (!a || !len) return;
    if (!a.src) a.src = `/api/admin/tracks/${id}/audio`;
    a.currentTime = f * len;
    setAt(a.currentTime);
  };

  return (
    <div>
      <Waveform peaks={peaks} progress={len ? at / len : 0} height={56} onSeek={seek} duration={len || undefined} label="Track position" className="mt-4" />
      <div className="mt-1.5 flex justify-between font-mono text-[11.5px] text-faint tnum">
        <span>{fmtTime(at)}</span>
        <span>{len ? fmtTime(len) : "–:––"}</span>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-lime text-ink hover:brightness-95"
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
              <path d="M6 4h4v16H6zM14 4h4v16h-4z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" className="ml-0.5 size-4" fill="currentColor" aria-hidden>
              <path d="M7 4l13 8-13 8z" />
            </svg>
          )}
        </button>
        <p className={`text-[13px] ${failed ? "text-danger" : "text-mute"}`} role={failed ? "alert" : undefined}>
          {failed ? "Couldn't play this file. It may have been removed." : "Listen to check a report. Each play goes in the admin log."}
        </p>
      </div>
      <audio
        ref={attach}
        preload="none"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onTimeUpdate={(e) => setAt(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setLen(e.currentTarget.duration)}
        onError={() => audio.current?.src && setFailed(true)}
      />
    </div>
  );
}
