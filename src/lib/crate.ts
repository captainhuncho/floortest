import "server-only";
import type { Track } from "./db";
import { storage } from "./storage";
import { zipStream, type Entry } from "./zip";

const xmlEsc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const safeName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "Untitled";

export function crateFileName(t: Track) {
  const ext = t.mime === "audio/wav" ? "wav" : "mp3";
  return `${safeName(`${t.artist} - ${t.title}`)} [${t.id}].${ext}`;
}

/**
 * Rekordbox collection XML. Rekordbox needs absolute file locations, so `baseDir`
 * is where the user will unzip the crate (e.g. /Users/me/Music/FloorTest).
 */
export function rekordboxXml(crateName: string, baseDir: string, tracks: Track[]) {
  const dir = baseDir.replace(/\\/g, "/").replace(/\/+$/, "");
  const loc = (t: Track) => {
    const full = `${dir}/${safeName(crateName)}/${crateFileName(t)}`;
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
          `FloorTest: ${t.message}`.slice(0, 250),
        )}" Location="${xmlEsc(loc(t))}"/>`,
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

export function m3u(tracks: Track[]) {
  return ["#EXTM3U", ...tracks.flatMap((t) => [`#EXTINF:${Math.round(t.duration ?? -1)},${t.artist} - ${t.title}`, crateFileName(t)])].join("\n") + "\n";
}

const textStream = (s: string) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(s));
      c.close();
    },
  });

/** Kept tracks + rekordbox.xml + M3U8, streamed from storage. `onTrackSent` fires after each file has gone out. */
export function crateZip(crateName: string, baseDir: string, tracks: Track[], onTrackSent?: (t: Track) => Promise<void> | void) {
  const folder = safeName(crateName);
  const files = tracks.filter((t) => t.file_key);
  const entries: Entry[] = [
    { name: `${folder}/rekordbox.xml`, open: async () => textStream(rekordboxXml(crateName, baseDir, files)) },
    { name: `${folder}/${folder}.m3u8`, open: async () => textStream(m3u(files)) },
    ...files.map((t) => ({
      name: `${folder}/${crateFileName(t)}`,
      open: async () => (await (await storage()).stream(t.file_key!)).body,
      onSent: onTrackSent && (() => onTrackSent(t)),
    })),
  ];
  return zipStream(entries);
}
