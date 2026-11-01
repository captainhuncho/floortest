"use client";

import { useEffect, useRef } from "react";
import { bindMediaSession, mediaSession, setMetadata, type MediaMeta } from "./media-session";

type Options = {
  /** The audio element the keys drive (null until there is one). */
  audio: HTMLAudioElement | null;
  /** What's loaded; null leaves the lock screen blank. */
  meta: MediaMeta | null;
  play?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
};

/**
 * Hardware Play/Pause, Next and Previous keys, headphone buttons, the lock screen, Control Centre and the Touch Bar,
 * for one player. They work while a track is loaded on the page, also when the tab isn't in front (that's how Media
 * Session works in Chrome, Edge, Safari and Firefox). The callbacks may change every render: the latest one runs.
 */
export function useMediaSession({ audio, meta, play, onNext, onPrev }: Options) {
  const latest = useRef({ play, onNext, onPrev });
  useEffect(() => {
    latest.current = { play, onNext, onPrev };
  });
  const hasNext = !!onNext;
  const hasPrev = !!onPrev;

  const title = meta?.title;
  const artist = meta?.artist;
  // One effect, so a new track or a changed list rebinds everything together (cheap) and the cleanup never leaves
  // the lock screen half set.
  useEffect(() => {
    const s = mediaSession();
    if (!s || !audio) return;
    setMetadata(s, title === undefined ? null : { title, artist });
    return bindMediaSession(s, audio, {
      play: () => (latest.current.play ? latest.current.play() : void audio.play().catch(() => {})),
      next: hasNext ? () => latest.current.onNext?.() : undefined,
      previous: hasPrev ? () => latest.current.onPrev?.() : undefined,
    });
  }, [audio, hasNext, hasPrev, title, artist]);
}
