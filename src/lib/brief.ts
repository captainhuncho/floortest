import { fmtDay } from "./format";

/**
 * A collection's brief, the same everywhere it's shown (collections card, collection page on phones and desktop, the public
 * link, the Send page lookup): same order, same labels, same formats. Places choose their own styling only.
 */
export type BriefItem = { key: "bpm" | "genres" | "wanted" | "deadline" | "note"; label: string; text: string; chips?: string[] };

export function briefItems(
  c: { bpm_min: number | null; bpm_max: number | null; brief_wanted: string | null; brief_note: string | null; closes_at: number | null },
  /** The collection's own genres (leave empty when it uses the default list). */
  genres: string[],
  tz?: string,
  at = Date.now(),
): BriefItem[] {
  const items: BriefItem[] = [];
  if (c.bpm_min && c.bpm_max) items.push({ key: "bpm", label: "BPM", text: `${c.bpm_min}–${c.bpm_max}` });
  if (genres.length) items.push({ key: "genres", label: "Genres", text: genres.join(", "), chips: genres });
  if (c.brief_wanted) items.push({ key: "wanted", label: "Wanted", text: c.brief_wanted });
  if (c.closes_at) items.push({ key: "deadline", label: "Deadline", text: `${c.closes_at > at ? "Open until" : "Closed"} ${fmtDay(c.closes_at, tz)}` });
  if (c.brief_note) items.push({ key: "note", label: "Note", text: `“${c.brief_note}”` });
  return items;
}
