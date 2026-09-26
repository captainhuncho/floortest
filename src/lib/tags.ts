"use client";

export type Tags = { title: string; artist: string };

/** Reads title/artist from ID3v2 (MP3) or RIFF LIST/INFO (WAV), falling back to "Artist - Title" filenames. */
export async function readTags(file: File): Promise<Tags> {
  const fromName = parseFilename(file.name);
  try {
    const head = new Uint8Array(await file.slice(0, 256 * 1024).arrayBuffer());
    const tags = isId3(head) ? id3(head) : isWav(head) ? await wavInfo(file, head) : null;
    return { title: tags?.title || fromName.title, artist: tags?.artist || fromName.artist };
  } catch {
    return fromName;
  }
}

export function parseFilename(name: string): Tags {
  const base = name
    .replace(/\.(wav|mp3)$/i, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const m = base.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: "", title: base };
}

const ascii = (b: Uint8Array, s: number, e: number) => String.fromCharCode(...b.slice(s, e));
const isId3 = (b: Uint8Array) => ascii(b, 0, 3) === "ID3";
const isWav = (b: Uint8Array) => ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 12) === "WAVE";

function decodeText(bytes: Uint8Array): string {
  const enc = bytes[0];
  const body = bytes.slice(1);
  const label = enc === 1 ? "utf-16" : enc === 2 ? "utf-16be" : enc === 3 ? "utf-8" : "latin1";
  return new TextDecoder(label).decode(body).replace(/\u0000/g, "").trim();
}

function id3(b: Uint8Array): Tags {
  const major = b[3];
  const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
  const end = Math.min(b.length, 10 + size);
  const out: Tags = { title: "", artist: "" };
  let off = 10;
  if (major < 3) return out; // ID3v2.2 uses 3-char frames; rare enough to skip
  while (off + 10 < end) {
    const id = ascii(b, off, off + 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break;
    const len =
      major === 4
        ? ((b[off + 4] & 0x7f) << 21) | ((b[off + 5] & 0x7f) << 14) | ((b[off + 6] & 0x7f) << 7) | (b[off + 7] & 0x7f)
        : (b[off + 4] << 24) | (b[off + 5] << 16) | (b[off + 6] << 8) | b[off + 7];
    const data = b.slice(off + 10, off + 10 + len);
    if (id === "TIT2") out.title = decodeText(data);
    if (id === "TPE1") out.artist = decodeText(data);
    off += 10 + len;
  }
  return out;
}

async function wavInfo(file: File, head: Uint8Array): Promise<Tags | null> {
  // LIST chunks can sit after the audio data, so walk chunk headers across the whole file.
  const out: Tags = { title: "", artist: "" };
  let off = 12;
  let guard = 0;
  while (off + 8 <= file.size && guard++ < 64) {
    const h = off + 8 <= head.length ? head.slice(off, off + 8) : new Uint8Array(await file.slice(off, off + 8).arrayBuffer());
    const id = ascii(h, 0, 4);
    const size = new DataView(h.buffer, h.byteOffset, 8).getUint32(4, true);
    if (id === "LIST") {
      const chunk = new Uint8Array(await file.slice(off + 8, off + 8 + Math.min(size, 64 * 1024)).arrayBuffer());
      if (ascii(chunk, 0, 4) === "INFO") {
        let p = 4;
        while (p + 8 <= chunk.length) {
          const sub = ascii(chunk, p, p + 4);
          const len = new DataView(chunk.buffer, chunk.byteOffset + p + 4, 4).getUint32(0, true);
          const text = new TextDecoder().decode(chunk.slice(p + 8, p + 8 + len)).replace(/\u0000/g, "").trim();
          if (sub === "INAM") out.title = text;
          if (sub === "IART") out.artist = text;
          p += 8 + len + (len % 2);
        }
      }
    }
    off += 8 + size + (size % 2);
  }
  return out;
}
