/** A cue point a DJ marks while preparing a set. Shared by the app and the Rekordbox export. */
export type Cue = { at: number; label: string };

export const MAX_CUES = 8;

/** Reads the stored JSON safely: sorted, deduplicated, clamped to the track, labels trimmed. */
export function parseCues(raw: string | null | undefined, duration?: number | null): Cue[] {
  let list: unknown = [];
  try {
    list = JSON.parse(raw || "[]");
  } catch {}
  if (!Array.isArray(list)) return [];
  const max = duration && duration > 0 ? duration : Infinity;
  const seen = new Set<number>();
  return list
    .filter((c): c is Cue => !!c && typeof c.at === "number" && Number.isFinite(c.at) && c.at >= 0 && c.at <= max)
    .map((c) => ({ at: Math.round(c.at * 10) / 10, label: String(c.label ?? "").trim().slice(0, 40) }))
    .filter((c) => (seen.has(c.at) ? false : (seen.add(c.at), true)))
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_CUES);
}

export const fmtCue = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
