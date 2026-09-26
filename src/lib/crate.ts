import "server-only";
import fs from "node:fs";
import zlib from "node:zlib";
import type { Track } from "./db";
import { trackPath } from "./core";

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

type Entry = { name: string; data: () => Buffer; onSent?: () => void };

/** Minimal store-only (uncompressed) ZIP writer, streamed one file at a time. Audio doesn't compress anyway. */
export function zipStream(entries: Entry[]): ReadableStream<Uint8Array> {
  const central: Buffer[] = [];
  let offset = 0;
  let i = 0;
  // pull() is only called again once the consumer has taken the previous chunks,
  // so an entry's onSent fires after its bytes have actually left.
  let pending: (() => void) | undefined;
  const dosTime = (() => {
    const d = new Date();
    const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
    const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    return { time, date };
  })();

  return new ReadableStream({
    pull(controller) {
      pending?.();
      pending = undefined;
      if (i < entries.length) {
        const e = entries[i++];
        const data = e.data();
        const name = Buffer.from(e.name, "utf8");
        const crc = zlib.crc32(data) >>> 0;
        if (offset + data.length > 0xfffffff0) {
          controller.error(new Error("Crate too large for a single ZIP"));
          return;
        }
        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0x0800, 6); // UTF-8 names
        local.writeUInt16LE(0, 8);
        local.writeUInt16LE(dosTime.time, 10);
        local.writeUInt16LE(dosTime.date, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);

        const cen = Buffer.alloc(46);
        cen.writeUInt32LE(0x02014b50, 0);
        cen.writeUInt16LE(20, 4);
        cen.writeUInt16LE(20, 6);
        cen.writeUInt16LE(0x0800, 8);
        cen.writeUInt16LE(0, 10);
        cen.writeUInt16LE(dosTime.time, 12);
        cen.writeUInt16LE(dosTime.date, 14);
        cen.writeUInt32LE(crc, 16);
        cen.writeUInt32LE(data.length, 20);
        cen.writeUInt32LE(data.length, 24);
        cen.writeUInt16LE(name.length, 28);
        cen.writeUInt32LE(offset, 42);
        central.push(cen, name);

        controller.enqueue(new Uint8Array(Buffer.concat([local, name])));
        controller.enqueue(new Uint8Array(data));
        offset += 30 + name.length + data.length;
        pending = e.onSent;
        return;
      }
      const cd = Buffer.concat(central);
      const end = Buffer.alloc(22);
      end.writeUInt32LE(0x06054b50, 0);
      end.writeUInt16LE(entries.length, 8);
      end.writeUInt16LE(entries.length, 10);
      end.writeUInt32LE(cd.length, 12);
      end.writeUInt32LE(offset, 16);
      controller.enqueue(new Uint8Array(Buffer.concat([cd, end])));
      controller.close();
    },
  });
}

export function crateZip(crateName: string, baseDir: string, tracks: Track[], onTrackSent?: (t: Track) => void) {
  const folder = safeName(crateName);
  const entries: Entry[] = [
    { name: `${folder}/rekordbox.xml`, data: () => Buffer.from(rekordboxXml(crateName, baseDir, tracks)) },
    { name: `${folder}/${folder}.m3u8`, data: () => Buffer.from(m3u(tracks)) },
    ...tracks
      .filter((t) => trackPath(t))
      .map((t) => ({
        name: `${folder}/${crateFileName(t)}`,
        data: () => fs.readFileSync(trackPath(t)!),
        onSent: onTrackSent && (() => onTrackSent(t)),
      })),
  ];
  return zipStream(entries);
}
