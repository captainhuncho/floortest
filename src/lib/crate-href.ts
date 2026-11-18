/** The three ways to download the Prepare crate (owner, 17 Nov: option 44). */
export type CrateKind = "playlist" | "rekordbox" | "files";

export const CRATE_KINDS: { kind: CrateKind; title: string; line: string }[] = [
  { kind: "playlist", title: "Tracks + playlist", line: "A folder with the files and an M3U8 playlist. Works in most DJ apps." },
  { kind: "rekordbox", title: "Tracks + Rekordbox playlist", line: "Adds a Rekordbox XML, so the crate shows up as a playlist." },
  { kind: "files", title: "Files only", line: "Just the audio files, no playlist." },
];

/**
 * The `/api/export` address for one choice: the kept tracks in a named folder with an M3U8 playlist; the same plus a
 * Rekordbox XML (`base` is where the folder will be unzipped, which the XML needs); or the files alone (`files=1`).
 * The export itself is unchanged: these are the addresses the old Download kept and Files only buttons used.
 */
export function crateHref(kind: CrateKind, name: string, base = ""): string {
  const p = new URLSearchParams({ name: name.trim() });
  if (kind === "rekordbox" && base.trim()) p.set("base", base.trim());
  if (kind === "files") p.set("files", "1");
  return `/api/export?${p}`;
}

/** A Rekordbox download needs the folder it will be unzipped into; every download needs a folder name. */
export const crateReady = (kind: CrateKind, name: string, base = "") => !!name.trim() && (kind !== "rekordbox" || !!base.trim());
