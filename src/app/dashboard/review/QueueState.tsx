"use client";

import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState } from "react";
import { usePlayer, type PlayerTrack } from "@/components/Player";
import { fmtTime } from "@/lib/format";
import { DetailPlayer } from "../DetailPlayer";
import { CARD, Cover, initials } from "@/components/Kit";

/**
 * The Review Queue answers a tap at once (owner, 28 Oct: "slow to respond to clicks"). Opening a track or deciding
 * one still asks the server for the full page (about 0.5–1 s from West Africa to London; once for a decision, which
 * moves to the next track's page first and saves after, so the answer carries that page), but
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
  /** Tracks just decided out of this tab, hidden from the list until the server has answered the decision. */
  gone: ReadonlySet<number>;
  leave: (id: number, decision: Decision) => void;
  /** The server answered the decision (saved, or failed): the list on screen is the truth again for this track. */
  settle: (id: number) => void;
};

const QueueCtx = createContext<Queue | null>(null);

/** Null outside the Review Queue, so the list and the decision rail work the same anywhere else. */
export const useQueue = () => useContext(QueueCtx);

/** A neighbouring track in the list: where it lives and what the list already knows about it. */
export type Step = { href: string; track: Glimpse } | null;

/**
 * Moves to the previous or next track (buttons, swipe, arrow keys): shows it at once, keeps the music going if the
 * track being left was playing, and asks the server for its page.
 */
export function useStep(fromId: number) {
  const queue = useQueue();
  const router = useRouter();
  const player = usePlayer();
  return useCallback(
    (to: Step) => {
      if (!to) return;
      const wasPlaying = player.current?.id === fromId && player.playing;
      queue?.show(to.track);
      if (wasPlaying) player.play(to.track);
      router.replace(to.href, { scroll: false });
    },
    [fromId, queue, router, player],
  );
}

/** Whether a decision takes the track out of the tab on screen (Needs review, Kept, Not for me; All keeps everything). */
function leavesTab(status: string, d: Decision) {
  return status === "review" || (status === "kept" && d === "passed") || (status === "passed" && d === "kept");
}

export function QueueState({ servedId, status, children }: { servedId: number | null; status: string; children: React.ReactNode }) {
  const [shown, setShown] = useState<Glimpse | null>(null);
  const [gone, setGone] = useState<ReadonlySet<number>>(() => new Set());
  // Once a page from the server shows the track on screen, the stand-in steps aside. (A quicker second tap keeps its
  // own track on screen until that one arrives.) A decided track stays hidden until its decision is answered: the
  // next track's page is often one loaded before the decision, whose list still has it.
  const [served, setServed] = useState(servedId);
  if (served !== servedId) {
    setServed(servedId);
    if (!shown || shown.id === servedId) setShown(null);
  }
  const value: Queue = {
    shown,
    show: setShown,
    gone,
    leave: (id, d) => {
      if (leavesTab(status, d)) setGone((g) => new Set(g).add(id));
    },
    settle: (id) =>
      setGone((g) => {
        if (!g.has(id)) return g;
        const rest = new Set(g);
        rest.delete(id);
        return rest;
      }),
  };
  return <QueueCtx.Provider value={value}>{children}</QueueCtx.Provider>;
}

/** The server's review panel, or the picked track at once while the server is still answering. */
export function ShownPanel({ servedId, children }: { servedId: number; children: React.ReactNode }) {
  const shown = useQueue()?.shown;
  if (!shown || shown.id === servedId) return <>{children}</>;
  const meta = [shown.bpm && `${Math.round(shown.bpm)} BPM`, shown.duration && fmtTime(shown.duration), shown.genre].filter(Boolean).join(" · ");
  const btn = "inline-flex min-h-13 items-center justify-center rounded-[15px] border text-[14.5px] font-semibold opacity-40";
  return (
    <div className={`${CARD} flex flex-col gap-3 p-3.5 sm:p-4`} aria-busy="true">
      <div className="flex items-center gap-3">
        <Cover text={initials(shown.title)} size="size-[46px]" />
        <div className="min-w-0 flex-1">
          <h2 className="line-clamp-2 text-[18px] font-semibold leading-tight tracking-[-0.02em] text-bone">{shown.title}</h2>
          <p className="mt-0.5 truncate text-[11.5px] text-mute">{shown.artist}</p>
        </div>
      </div>
      {meta && <p className="font-mono text-[11.5px] text-mute tnum">{meta}</p>}
      <DetailPlayer track={shown} />
      {/* Same place and size as the real buttons, so nothing moves when they arrive a moment later. */}
      <div className="grid grid-cols-2 gap-2" aria-hidden="true">
        <span className={`${btn} border-line-2 bg-well text-bone`}>Not for me</span>
        <span className={`${btn} border-transparent bg-lime text-ink`}>Keep</span>
      </div>
    </div>
  );
}
