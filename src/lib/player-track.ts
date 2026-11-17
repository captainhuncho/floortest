import type { PlayerTrack } from "@/components/Player";

/** Shared by server pages and client lists, so it lives outside any "use client" module. */
export const toPlayer = (r: {
  id: number;
  title: string;
  artist: string;
  peaks: number[] | null;
  duration: number | null;
  played: boolean;
  /** Passed on when the row has it, so the player's heart knows whether the track is Kept. */
  decision?: "kept" | "passed" | null;
}): PlayerTrack => ({
  id: r.id,
  title: r.title,
  artist: r.artist,
  peaks: r.peaks,
  duration: r.duration,
  played: r.played,
  ...(r.decision !== undefined ? { decision: r.decision } : {}),
});
