"use client";

import { useStep, type Step } from "./QueueState";

/**
 * Back and forward through the tracks in this view (owner, 28 Oct), beside "2 of 5". Below 1280px only; wide screens
 * have the list beside the track and the arrow keys. The card also turns on a sideways swipe (DecisionRail).
 */
export function TrackStepper({ fromId, prev, next, position }: { fromId: number; prev: Step; next: Step; position: string | null }) {
  const step = useStep(fromId);
  const btn = "grid size-11 place-items-center rounded-lg border border-line text-bone disabled:opacity-30 xl:hidden";
  return (
    <div className="-mt-1 -mr-1 flex shrink-0 items-center gap-1 xl:m-0">
      <button type="button" className={btn} aria-label="Previous track" disabled={!prev} onClick={() => step(prev)}>
        <Chevron back />
      </button>
      {position && <span className="min-w-12 text-center font-mono text-xs text-mute tnum">{position}</span>}
      <button type="button" className={btn} aria-label="Next track" disabled={!next} onClick={() => step(next)}>
        <Chevron />
      </button>
    </div>
  );
}

function Chevron({ back = false }: { back?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={back ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
    </svg>
  );
}
