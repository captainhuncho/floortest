"use client";

import { createContext, useContext, useState } from "react";
import type { PlayerTrack } from "@/components/Player";
import { fmtTime } from "@/lib/format";
import { DetailPlayer } from "../DetailPlayer";

/**
 * The Review Queue answers a tap at once (owner, 28 Oct: "slow to respond to clicks"). Opening a track or deciding
 * one still asks the server for the full page (about 0.5–1 s from West Africa to London, twice for a decision), but
 * the screen no longer waits for it: the list already knows each track's title, artist and waveform, so the picked
 * or next track shows straight away and its details (message, sender, tags) fill in when the server answers.
 */

/** What the list already knows about a track: enough to show it while the server sends the rest. */
export type Glimpse = PlayerTrack & { genre?: string | null; bpm?: number | null };
type Decision = "kept" | "passed";

type Queue = {
  /** The track on screen ahead of the server, or null when the server's panel is current. */
  shown: Glimpse | null;
  show: (t: Glimpse) => void;
  /** Tracks just decided out of this tab, hidden from the list until the server's own list arrives. */
  gone: ReadonlySet<number>;
  leave: (id: number, decision: Decision) => void;
};

const QueueCtx = createContext<Queue | null>(null);

/** Null outside the Review Queue, so the list and the decision rail work the same anywhere else. */
export const useQueue = () => useContext(QueueCtx);

/** Whether a decision takes the track out of the tab on screen (Needs review, Kept, Not for me; All keeps everything). */
function leavesTab(status: string, d: Decision) {
  return status === "review" || (status === "kept" && d === "passed") || (status === "passed" && d === "kept");
}

export function QueueState({ servedId, status, children }: { servedId: number | null; status: string; children: React.ReactNode }) {
  const [shown, setShown] = useState<Glimpse | null>(null);
  const [gone, setGone] = useState<ReadonlySet<number>>(() => new Set());
  // A new page from the server replaces the guesses: its list is the truth, and once it shows the track on screen
  // the stand-in steps aside. (A quicker second tap keeps its own track on screen until that one arrives.)
  const [served, setServed] = useState(servedId);
  if (served !== servedId) {
    setServed(servedId);
    setGone(new Set());
    if (!shown || shown.id === servedId) setShown(null);
  }
  const value: Queue = {
    shown,
    show: setShown,
    gone,
    leave: (id, d) => {
      if (leavesTab(status, d)) setGone((g) => new Set(g).add(id));
    },
  };
  return <QueueCtx.Provider value={value}>{children}</QueueCtx.Provider>;
}

/** The server's review panel, or the picked track at once while the server is still answering. */
export function ShownPanel({ servedId, children }: { servedId: number; children: React.ReactNode }) {
  const shown = useQueue()?.shown;
  if (!shown || shown.id === servedId) return <>{children}</>;
  const meta = [shown.bpm && `${Math.round(shown.bpm)} BPM`, shown.duration && fmtTime(shown.duration), shown.genre].filter(Boolean).join(" · ");
  const btn = "btn h-12 border border-line text-[15px] font-bold";
  return (
    <div className="p-4 sm:p-6" aria-busy="true">
      <h2 className="text-xl font-bold leading-tight tracking-[-0.3px] text-bone md:text-2xl">{shown.title}</h2>
      <p className="mt-1 text-sm text-mute">{shown.artist}</p>
      {meta && <p className="mt-3 font-mono text-xs text-mute tnum md:text-[13px]">{meta}</p>}
      <div className="mt-4 md:mt-5">
        <DetailPlayer track={shown} />
      </div>
      {/* Same place and size as the real buttons, so nothing moves when they arrive a moment later. */}
      <div className="mt-4 grid grid-cols-[1fr_1.3fr_1fr] gap-2 md:mt-5 md:gap-2.5" aria-hidden="true">
        <span className={`${btn} opacity-40`}>Not for me</span>
        <span className={`${btn} border-lime bg-lime text-ink opacity-40`}>Keep</span>
        <span className={`${btn} opacity-40`}>Reply</span>
      </div>
    </div>
  );
}
