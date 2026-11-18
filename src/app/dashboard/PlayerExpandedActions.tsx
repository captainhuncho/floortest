"use client";

import Link from "next/link";
import { useRef, useTransition } from "react";
import { usePlayer, type PlayerTrack } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { decideTrack, undoDecision } from "./actions/review";
import { trackHref } from "./PlayerBars";

const ACTION = "inline-flex min-h-11 flex-1 items-center justify-center rounded-[13px] border px-3.5 text-[13px] font-semibold transition-colors duration-100 disabled:opacity-50";
const QUIET = `${ACTION} border-(--glass-line) text-bone hover:bg-(--glass-on)`;
const LIME = `${ACTION} border-transparent bg-lime text-ink`;

/**
 * The actions under the track in the expanded player (Design, options 27 to 30). A waiting track: Keep and Not for me. A
 * kept track: Open track. The same server actions as the Queue (actions/review.ts): the screen changes at once and goes
 * back, with a message, if the server says no. Projects music has nothing to decide.
 * No Played out here yet: it may only show when this person may mark it and the track allows it (never for an
 * evaluation-only track), and the player doesn't carry either fact. The track's own page has it.
 */
export function PlayerActions({ track, onLeave }: { track: PlayerTrack; onLeave: () => void }) {
  const { markDecision } = usePlayer();
  const toast = useToast();
  const [busy, start] = useTransition();
  // A second tap before the first answer comes back sends nothing.
  const sending = useRef(false);

  const open = (
    <Link href={trackHref(track)} onClick={onLeave} className={QUIET}>
      {track.src ? "Open in Projects" : "Open track"}
    </Link>
  );
  if (track.decision === undefined) return <div className="flex gap-2">{open}</div>;

  const decide = (to: "kept" | "passed") => {
    if (busy || sending.current) return;
    sending.current = true;
    const before = track.decision ?? null;
    const failed = () => {
      markDecision(track.id, before);
      toast.show({ message: `Couldn't save that for “${track.title}”. Nothing changed. Try again.`, tone: "error" });
    };
    markDecision(track.id, to);
    start(async () => {
      try {
        const token = await decideTrack(track.id, to);
        // No token: the desk owner's or an admin's call stands, or this desk is read-only here.
        if (!token) return failed();
        toast.show({
          message: to === "kept" ? `“${track.title}” added to Prepare for set` : `Not for me: “${track.title}”`,
          action: {
            label: "Undo",
            run: async () => {
              markDecision(track.id, token.prev.decision);
              await undoDecision(token);
            },
          },
        });
      } catch {
        failed();
      } finally {
        sending.current = false;
      }
    });
  };

  if (track.decision !== "kept")
    return (
      <div className="flex gap-2">
        <button type="button" onClick={() => decide("kept")} disabled={busy} className={LIME}>
          Keep
        </button>
        {track.decision === "passed" ? (
          open
        ) : (
          <button type="button" onClick={() => decide("passed")} disabled={busy} className={QUIET}>
            Not for me
          </button>
        )}
      </div>
    );

  return <div className="flex gap-2">{open}</div>;
}
