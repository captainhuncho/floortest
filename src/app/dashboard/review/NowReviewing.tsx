"use client";

import { useEffect, useRef, useState } from "react";
import { isTyping, PlayIcon, usePlayer, type PlayerTrack } from "@/components/Player";
import { overlayOpen, shortcutsOn } from "@/components/useShortcuts";
import type { ReplyResult } from "../actions/review";
import { MoreMenu, type ReportProps } from "./MoreMenu";
import { InfoButton } from "./ReviewInfo";
import { useStep, type Step } from "./QueueState";
import { ReplyPanel } from "./ReplyCard";

/** How many bars the phone card draws before it falls back to one filling line. */
const MAX_BARS = 20;

/** Phones: where this track sits in the view, as story bars over the cover ("5 of 11"). */
export function StoryBars({ at, total }: { at: number; total: number }) {
  return (
    <div className="mb-2.5 md:hidden">
      <p className="sr-only">
        Track {at} of {total}
      </p>
      {total <= MAX_BARS ? (
        <div aria-hidden className="flex gap-1">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-[3px] min-w-0 flex-1 rounded-full ${i < at ? "bg-bone" : "bg-line-2"}`} />
          ))}
        </div>
      ) : (
        <div aria-hidden className="h-[3px] overflow-hidden rounded-full bg-line-2">
          <span className="block h-full rounded-full bg-bone" style={{ width: `${(at / total) * 100}%` }} />
        </div>
      )}
      <p aria-hidden className="mt-1.5 text-center text-[11px] text-mute tnum">
        {at} of {total}
      </p>
    </div>
  );
}

const CONTROL = "grid size-11 shrink-0 place-items-center rounded-full text-bone transition-colors duration-100 active:bg-well disabled:text-faint disabled:opacity-50";

function Skip({ back = false }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className={`size-4 ${back ? "-scale-x-100" : ""}`} fill="currentColor" aria-hidden>
      <path d="M2.5 3.2v9.6a.7.7 0 0 0 1.1.6l6.6-4.8a.7.7 0 0 0 0-1.2L3.6 2.6a.7.7 0 0 0-1.1.6Z" />
      <rect x="11.5" y="2.5" width="2" height="11" rx="1" />
    </svg>
  );
}

function Jump({ back = false }: { back?: boolean }) {
  return (
    <span className="relative grid place-items-center">
      <svg viewBox="0 0 24 24" className={`size-7 ${back ? "-scale-x-100" : ""}`} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M20 12a8 8 0 1 1-2.6-5.9" />
        <path d="M20 4v4h-4" />
      </svg>
      <span aria-hidden className="absolute text-[8.5px] font-bold tnum">
        15
      </span>
    </span>
  );
}

/**
 * Phones: the card's transport, icons only: previous, back 15 s, play or pause, forward 15 s, next. No wave and no
 * times here; the mini player at the bottom shows progress. Laptops have none: the floating bar plays the track.
 */
export function CardControls({ track, prev, next }: { track: PlayerTrack; prev: Step; next: Step }) {
  const { current, playing, play, toggle, seekBy } = usePlayer();
  const step = useStep(track.id);
  const isCurrent = current?.id === track.id;
  return (
    <div role="group" aria-label="Playback" className="flex items-center justify-between md:hidden">
      <button type="button" aria-label="Previous track" disabled={!prev} onClick={() => step(prev)} className={CONTROL}>
        <Skip back />
      </button>
      <button type="button" aria-label="Back 15 seconds" disabled={!isCurrent} onClick={() => seekBy(-15)} className={CONTROL}>
        <Jump back />
      </button>
      <button
        type="button"
        data-card-play
        aria-label={isCurrent && playing ? `Pause ${track.title}` : `Play ${track.title}`}
        onClick={() => (isCurrent ? toggle() : play(track))}
        className="grid size-14 shrink-0 place-items-center rounded-full bg-bone text-ink transition-transform duration-100 active:scale-95 motion-reduce:active:scale-100"
      >
        <PlayIcon playing={isCurrent && playing} className="size-5" />
      </button>
      <button type="button" aria-label="Forward 15 seconds" disabled={!isCurrent} onClick={() => seekBy(15)} className={CONTROL}>
        <Jump />
      </button>
      <button type="button" aria-label="Next track" disabled={!next} onClick={() => step(next)} className={CONTROL}>
        <Skip />
      </button>
    </div>
  );
}

/** Info and More: 44px squares on laptops, 52px beside the taller phone buttons (44px wide under 360px). */
const SQUARE = "inline-flex min-h-13 w-13 max-[359px]:w-11 shrink-0 items-center justify-center rounded-[15px] border border-line bg-well text-bone transition-colors hover:border-line-2 md:min-h-11 md:w-11 md:rounded-[13px]";

/**
 * Info and More beside Keep and Not for me (review card option 1; owner, 20 Nov). Info opens the track's facts and the
 * sender's record; Reply, Download, Move, Report and Delete live in More. R (from anywhere outside a field) still
 * opens the reply panel, from the More button so focus comes back there.
 */
export function PanelCalls({
  trackId,
  href,
  senderName,
  onReply,
  move,
  project,
  report,
  onDelete,
}: {
  trackId: number;
  href: string;
  senderName: string;
  onReply: (fd: FormData) => Promise<ReplyResult>;
  move?: React.ReactNode;
  project?: React.ReactNode;
  report?: ReportProps;
  onDelete?: () => Promise<void>;
}) {
  const [replying, setReplying] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || e.key.toLowerCase() !== "r") return;
      // Single-key shortcuts are switched off in this browser (Settings → Account).
      if (!shortcutsOn()) return;
      // Another layer is open (More, a confirm): R belongs to it.
      if (overlayOpen()) return;
      e.preventDefault();
      // From the More button, so closing the panel puts focus back there and not at the top of the page.
      wrap.current?.querySelector<HTMLButtonElement>('button[aria-label="More"]')?.focus({ preventScroll: true });
      setReplying(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <div ref={wrap} className="flex shrink-0 gap-2">
      <InfoButton className={SQUARE} />
      <MoreMenu trackId={trackId} href={href} onReply={() => setReplying(true)} download={`/api/tracks/${trackId}/download`} move={move} project={project} report={report} onDelete={onDelete} />
      <ReplyPanel open={replying} onClose={() => setReplying(false)} senderName={senderName} onReply={onReply} />
    </div>
  );
}
