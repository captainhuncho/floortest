"use client";

import { PlayIcon, usePlayer, type PlayerTrack } from "@/components/Player";
import { ROUND } from "./FolderRow";

/** Shuffle and play for a folder page: plays its tracks in order, or in a fresh random order. Nothing when it's empty. */
export function PlayAll({ queue, name }: { queue: PlayerTrack[]; /** The folder's name, for the spoken labels. */ name: string }) {
  const { current, playing, play, toggle } = usePlayer();
  if (!queue.length) return null;
  const mine = !!current && queue.some((t) => t.id === current.id);
  const shuffle = () => {
    // Fisher–Yates on a copy; the folder's own order is left alone.
    const order = [...queue];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    play(order[0], order);
  };
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={shuffle} aria-label={`Shuffle ${name}`} className={ROUND}>
        <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 7h3.2a4 4 0 0 1 3.3 1.7l4 5.6a4 4 0 0 0 3.3 1.7h3.2M17.5 13l3 3-3 3" />
          <path d="M3.5 17h3.2a4 4 0 0 0 3.3-1.7l.6-.9M13.4 9.6l.6-.9A4 4 0 0 1 17.3 7h3.2M17.5 4l3 3-3 3" />
        </svg>
      </button>
      <button type="button" onClick={() => (mine ? toggle() : play(queue[0], queue))} aria-label={mine && playing ? `Pause ${name}` : `Play ${name}`} className="grid size-12 shrink-0 place-items-center rounded-full bg-bone text-ink transition-transform active:scale-95 motion-reduce:transition-none">
        <PlayIcon playing={mine && playing} className="size-[18px]" />
      </button>
    </div>
  );
}
