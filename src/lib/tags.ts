"use client";

/**
 * Details already inside an audio file (ID3 in MP3s, ID3 or INFO chunks in WAVs), read in the sender's browser
 * before upload, so forms come pre-filled. Falls back to the file name ("01 - Artist - Title.wav"). Nothing is uploaded.
 */
export type Tags = {
  title: string;
  artist: string;
  album: string;
  trackNo: number | null;
  bpm: number | null;
  key: string;
  isrc: string;
};

export async function readTags(file: File): Promise<Tags> {
  const fromName = parseFilename(file.name);
  try {
    const { parseBlob } = await import("music-metadata");
    const { common } = await parseBlob(file, { skipCovers: true, duration: false });
    const isrc = (common.isrc?.[0] ?? "").toUpperCase().replace(/-/g, "");
    return {
      title: common.title?.trim() || fromName.title,
      artist: common.artist?.trim() || common.albumartist?.trim() || fromName.artist,
      album: common.album?.trim() ?? "",
      trackNo: common.track?.no && common.track.no >= 1 && common.track.no <= 99 ? common.track.no : fromName.trackNo,
      bpm: common.bpm && common.bpm > 40 && common.bpm < 250 ? Math.round(common.bpm) : null,
      key: (common.key ?? "").trim().slice(0, 12),
      isrc: /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc) ? isrc : "",
    };
  } catch {
    return fromName;
  }
}

/** "01 - Artist - Title (Extended Mix).wav" → track 1, artist, title. */
export function parseFilename(name: string): Tags {
  let base = name
    .replace(/\.(wav|mp3)$/i, "")
    .replace(/_+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  let trackNo: number | null = null;
  const num = base.match(/^(\d{1,2})[\s.\-–—)]+\s*(.+)$/);
  if (num && Number(num[1]) >= 1) {
    trackNo = Number(num[1]);
    base = num[2];
  }
  const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  const empty = { album: "", bpm: null, key: "", isrc: "", trackNo };
  return m ? { ...empty, artist: m[1].trim(), title: m[2].trim() } : { ...empty, artist: "", title: base };
}

/**
 * The file's details arrive after the form is on screen (the tag reader loads on first use, which can take seconds), so
 * they fill only the fields still as they started: anything the sender typed or picked meanwhile is kept. Before this
 * (31 Oct), a late read replaced the whole set and wiped a just-typed artist, so the send stopped at "One thing left".
 */
export function fillFromFile(current: Tags, initial: Tags, read: Tags): Tags {
  const keep = <K extends keyof Tags>(k: K): Tags[K] => (current[k] === initial[k] ? read[k] : current[k]);
  return { title: keep("title"), artist: keep("artist"), album: keep("album"), trackNo: keep("trackNo"), bpm: keep("bpm"), key: keep("key"), isrc: keep("isrc") };
}
