import "server-only";
import type { Track } from "./db";
import { storage } from "./storage";
import { zipStream, type Entry } from "./zip";

export { crateFileName, m3u, rekordboxXml, safeName } from "./rekordbox";
import { crateFileName, m3u, rekordboxXml, safeName, textStream } from "./rekordbox";

export function crateZip(
  crateName: string,
  baseDir: string,
  tracks: Track[],
  onTrackSent?: (t: Track) => Promise<void> | void,
  filesOnly = false,
) {
  const folder = safeName(crateName);
  const files = tracks.filter((t) => t.file_key);
  const entries: Entry[] = [
    ...(filesOnly
      ? []
      : [
          { name: `${folder}/rekordbox.xml`, open: async () => textStream(rekordboxXml(crateName, baseDir, files)) },
          { name: `${folder}/${folder}.m3u8`, open: async () => textStream(m3u(files)) },
        ]),
    ...files.map((t) => ({
      name: `${folder}/${crateFileName(t)}`,
      open: async () => (await (await storage()).stream(t.file_key!)).body,
      onSent: onTrackSent && (() => onTrackSent(t)),
    })),
  ];
  return zipStream(entries);
}
