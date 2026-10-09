"use client";

import { useIsPlaying } from "./Player";

/**
 * The FloorTest crest, alive: it turns like a record at 33⅓ while a track is playing and holds still otherwise.
 * `intro` plays a one-time "needle drop" (spins up and settles upright) on first view. Reduced motion: always still.
 */
export function Crest({ className = "size-7", intro = false }: { className?: string; intro?: boolean }) {
  const playing = useIsPlaying();
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src="/brand/crest.svg" alt="" aria-hidden className={`crest shrink-0 ${playing !== null ? "crest-deck" : ""} ${playing ? "crest-playing" : ""} ${intro ? "crest-intro" : ""} ${className}`} />
  );
}
