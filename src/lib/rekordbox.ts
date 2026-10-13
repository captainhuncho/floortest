import { parseCues } from "./cues";
import type { Track } from "./db";

/** Rekordbox XML and M3U writing. Pure functions, so they can be tested without the server. */

export const xmlEsc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled";

export function crateFileName(t: Track) {
  const ext = t.mime === "audio/wav" ? "wav" : "mp3";
  return `${safeName(`${t.artist} - ${t.title}`)} [${t.id}].${ext}`;
}

/** Where a track sits inside a crate: EPs and albums get their own folder, numbered in track order. */
export function cratePath(t: Track & { release_folder?: string | null }) {
  if (!t.release_folder) return crateFileName(t);
  const no = t.track_no ? `${String(t.track_no).padStart(2, "0")} ` : "";
  return `${safeName(t.release_folder)}/${no}${crateFileName(t)}`;
}

/**
 * Rekordbox collection XML. Rekordbox needs absolute file locations, so `baseDir`
 * is where the user will unzip the crate (e.g. /Users/me/Music/FloorTest).
 */
export function rekordboxXml(crateName: string, baseDir: string, tracks: Track[]) {
  const dir = baseDir.replace(/\\/g, "/").replace(/\/+$/, "");
  const loc = (t: Track) => {
    const full = `${dir}/${safeName(crateName)}/${cratePath(t)}`;
    // Keep Windows drive letters (C:) literal; they need a leading slash after localhost.
    const encoded = full.split("/").map(encodeURIComponent).join("/").replace(/^([A-Za-z])%3A/, "$1:");
    return `file://localhost${encoded.startsWith("/") ? "" : "/"}${encoded}`;
  };
  const rows = tracks
    .map(
      (t, i) =>
        `    <TRACK TrackID="${i + 1}" Name="${xmlEsc(t.title)}" Artist="${xmlEsc(t.artist)}" Kind="${
          t.mime === "audio/wav" ? "WAV File" : "MP3 File"
        }" Size="${t.size}" TotalTime="${Math.round(t.duration ?? 0)}" AverageBpm="${(t.bpm ?? 0).toFixed(
          2,
        )}" DateAdded="${new Date(t.created_at).toISOString().slice(0, 10)}" Comments="${xmlEsc(
          [t.energy ? `Energy ${t.energy}/5` : "", t.message ? `FloorTest: ${t.message}` : ""].filter(Boolean).join(" · ").slice(0, 250),
        )}" Location="${xmlEsc(loc(t))}"${positionMarks(t)}`,
    )
    .join("\n");
  const keys = tracks.map((_, i) => `        <TRACK Key="${i + 1}"/>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<DJ_PLAYLISTS Version="1.0.0">
  <PRODUCT Name="FloorTest" Version="0.2.0" Company="FloorTest"/>
  <COLLECTION Entries="${tracks.length}">
${rows}
  </COLLECTION>
  <PLAYLISTS>
    <NODE Type="0" Name="ROOT" Count="1">
      <NODE Name="${xmlEsc(crateName)}" Type="1" KeyType="0" Entries="${tracks.length}">
${keys}
      </NODE>
    </NODE>
  </PLAYLISTS>
</DJ_PLAYLISTS>
`;
}

/** Cue points as Rekordbox memory cues (Num="-1"), or a self-closing tag when there are none. */
function positionMarks(t: Track) {
  const cues = parseCues(t.cues, t.duration);
  if (!cues.length) return "/>";
  const marks = cues.map((c) => `      <POSITION_MARK Name="${xmlEsc(c.label)}" Type="0" Start="${c.at.toFixed(3)}" Num="-1"/>`).join("\n");
  return `>\n${marks}\n    </TRACK>`;
}

/** One line per entry: a sender's title or artist can't start a new line, which a player would read as another track. */
const oneLine = (s: string) => s.replace(/[\x00-\x1f\x7f\u2028\u2029]+/g, " ");

export function m3u(tracks: Track[]) {
  return ["#EXTM3U", ...tracks.flatMap((t) => [`#EXTINF:${Math.round(t.duration ?? -1)},${oneLine(`${t.artist} - ${t.title}`)}`, oneLine(cratePath(t))])].join("\n") + "\n";
}

export const textStream = (s: string) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(s));
      c.close();
    },
  });

/** Kept tracks + rekordbox.xml + M3U8, streamed from storage. `onTrackSent` fires after each file has gone out. */
/** A crate ZIP. With filesOnly, just the original audio: no Rekordbox XML or playlist. */
