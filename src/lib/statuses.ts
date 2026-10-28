import type { Decision } from "./db";

/**
 * The one definition of a track's review status: its key, the label people see, and the SQL that selects it
 * (on a `tracks t` alias). Every list, filter and badge reads from here.
 */
export const TRACK_STATUSES = [
  ["review", "Needs review", "t.decision IS NULL"],
  ["kept", "Kept", "t.decision = 'kept'"],
  ["passed", "Not for me", "t.decision = 'passed'"],
  ["all", "All", "1 = 1"],
] as const;
export type TrackStatus = (typeof TRACK_STATUSES)[number][0];

/** The status a `?s=` value names; anything not in the list above falls back (its SQL is never built from the address). */
export const pickStatus = (s: string | undefined, fallback: TrackStatus = "review"): TrackStatus =>
  TRACK_STATUSES.find(([k]) => k === s)?.[0] ?? fallback;

/** The label for a track's decision: Kept, Not for me, or Needs review. */
export const decisionLabel = (d: Decision | null | undefined) => (d === "kept" ? "Kept" : d === "passed" ? "Not for me" : "Needs review");
