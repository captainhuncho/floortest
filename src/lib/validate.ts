/**
 * Structural validation of uploaded audio. This is not antivirus scanning: it rejects anything
 * that isn't a well-formed WAV or MPEG audio stream, which covers disguised executables, archives
 * and documents. It also checks the end of the file, so nothing can ride along after real audio
 * (a "polyglot" file): an MP3 must end in audio frames or tags of their exact size, and a WAV
 * may only have a bounded trailer after its data. Files are only ever served as audio, never executed.
 */
type Reader = { size: number; read(start: number, end: number): Promise<Uint8Array> };

export async function validateAudio(file: Reader): Promise<{ ok: true; kind: "wav" | "mp3" } | { ok: false; reason: string }> {
  const head = await file.read(0, Math.min(file.size, 1024 * 1024) - 1);
  const ascii = (s: number, e: number) => String.fromCharCode(...head.slice(s, e));
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength);

  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") {
    // The RIFF header states the file's length. Anything well beyond it is a hidden payload.
    const riffEnd = 8 + view.getUint32(4, true);
    const declared = view.getUint32(4, true);
    // Some recorders leave the length as 0 or 0xFFFFFFFF while streaming; only trust a real value.
    const streaming = !(declared > 36 && declared !== 0xffffffff);
    if (!streaming && file.size > riffEnd + TRAILER_ALLOWANCE) return { ok: false, reason: WAV_TRAILER };
    let off = 12;
    let fmtOk = false;
    while (off + 8 <= head.length) {
      const id = ascii(off, off + 4);
      const size = view.getUint32(off + 4, true);
      if (id === "fmt ") {
        if (off + 24 > head.length) break;
        const format = view.getUint16(off + 8, true);
        const channels = view.getUint16(off + 10, true);
        const rate = view.getUint32(off + 12, true);
        const bits = view.getUint16(off + 22, true);
        fmtOk =
          [1, 3, 0xfffe].includes(format) &&
          channels >= 1 &&
          channels <= 8 &&
          rate >= 8000 &&
          rate <= 384000 &&
          [8, 16, 24, 32].includes(bits);
        if (!fmtOk) return { ok: false, reason: "Unsupported WAV format. Use PCM or float WAV." };
      }
      if (id === "data") {
        if (!fmtOk) return { ok: false, reason: "This WAV file is missing its format header." };
        // A streaming recorder may also leave the data size open; then the audio runs to the end of the file.
        if (streaming && size === 0xffffffff) return { ok: true, kind: "wav" };
        const dataEnd = off + 8 + size;
        if (dataEnd > file.size + 1) return { ok: false, reason: "This WAV file looks incomplete or damaged." };
        // An empty data chunk with bytes after it holds no audio, only whatever follows.
        if (size === 0 && file.size > dataEnd) return { ok: false, reason: WAV_TRAILER };
        // Without a real RIFF length, the data chunk itself must reach (nearly) the end of the file.
        if (streaming && file.size > dataEnd + TRAILER_ALLOWANCE) return { ok: false, reason: WAV_TRAILER };
        return { ok: true, kind: "wav" };
      }
      off += 8 + size + (size % 2);
    }
    return { ok: false, reason: "This WAV file looks incomplete or damaged." };
  }

  // MP3: skip an ID3v2 tag, then require two consecutive valid MPEG audio frame headers.
  let off = 0;
  if (ascii(0, 3) === "ID3" && head.length > 10) {
    const size = ((head[6] & 0x7f) << 21) | ((head[7] & 0x7f) << 14) | ((head[8] & 0x7f) << 7) | (head[9] & 0x7f);
    off = 10 + size + (head[5] & 0x10 ? 10 : 0);
    if (off >= file.size) return { ok: false, reason: "This MP3 has tags but no audio." };
    if (off + 8192 > head.length) {
      const more = await file.read(off, Math.min(file.size, off + 64 * 1024) - 1);
      if (!findFrames(more, 0)) return { ok: false, reason: "That file doesn't look like MP3 audio." };
      return (await mp3TailOk(file, head, off)) ? { ok: true, kind: "mp3" } : { ok: false, reason: MP3_TRAILER };
    }
  }
  if (!findFrames(head, off)) return { ok: false, reason: "That file doesn't look like WAV or MP3 audio." };
  return (await mp3TailOk(file, head, off)) ? { ok: true, kind: "mp3" } : { ok: false, reason: MP3_TRAILER };
}

/** Room for padding and trailing metadata chunks (ID3, bext) after the declared audio. */
const TRAILER_ALLOWANCE = 256 * 1024;

const WAV_TRAILER = "This WAV file has unexpected data after the audio.";
const MP3_TRAILER = "This MP3 has unexpected data after the audio.";
/** The longest Layer III frame (MPEG-1, 320 kbps, 32 kHz). A real frame starts within this many bytes of any point. */
const MAX_FRAME = 1441;

/**
 * The end of an MP3 must be audio frames running right up to the last byte, optionally followed by
 * tags of their exact size (APEv2 and Lyrics3 by their stated length, ID3v1 as the final 128 bytes).
 * Runs for every size; small files reuse the bytes already read for the head.
 */
async function mp3TailOk(file: Reader, head: Uint8Array, audioStart: number) {
  const bytes = (s: number, e: number) => (e <= head.length ? Promise.resolve(head.slice(s, e)) : file.read(s, e - 1));
  const end = await stripTags(file.size, audioStart, bytes);
  if (end < 0) return false;
  const start = Math.max(audioStart, end - 64 * 1024);
  return framesReachEnd(await bytes(start, end));
}

/** Where the audio ends once the trailing tags are taken off, or -1 if a tag claims more than there is. */
async function stripTags(size: number, audioStart: number, bytes: (s: number, e: number) => Promise<Uint8Array>) {
  const text = (b: Uint8Array, s: number, e: number) => String.fromCharCode(...b.slice(s, e));
  let end = size;
  for (let round = 0; round < 4; round++) {
    if (end - audioStart >= 128 && text(await bytes(end - 128, end - 125), 0, 3) === "TAG") {
      end -= 128;
      continue;
    }
    if (end - audioStart >= 32) {
      const footer = await bytes(end - 32, end);
      if (text(footer, 0, 8) === "APETAGEX") {
        const view = new DataView(footer.buffer, footer.byteOffset, 32);
        const total = view.getUint32(12, true) + (view.getUint32(20, true) & 0x80000000 ? 32 : 0);
        if (total < 32 || total > end - audioStart) return -1;
        end -= total;
        continue;
      }
    }
    if (end - audioStart >= 15) {
      const footer = await bytes(end - 15, end);
      const digits = text(footer, 0, 6);
      if (text(footer, 6, 15) === "LYRICS200" && /^\d{6}$/.test(digits)) {
        const total = Number(digits) + 15;
        if (total > end - audioStart || text(await bytes(end - total, end - total + 11), 0, 11) !== "LYRICSBEGIN") return -1;
        end -= total;
        continue;
      }
    }
    break;
  }
  return end;
}

/** True if a chain of at least two frames, starting near the front of `b`, ends exactly at its last byte (or in a cut-off final frame). */
function framesReachEnd(b: Uint8Array) {
  for (let i = 0; i < Math.min(b.length, MAX_FRAME); i++) {
    let j = i;
    let count = 0;
    for (let len = frameLength(b, j); len > 0 && j + len <= b.length; len = frameLength(b, j)) {
      j += len;
      count++;
    }
    if (count < 2) continue;
    if (j === b.length) return true;
    // The encoder may have been stopped mid-frame: allow a final frame whose header is valid but whose body is cut off.
    if (frameLength(b, j) > 0) return true;
  }
  return false;
}

const BITRATES_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const BITRATES_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] } as Record<number, number[]>;

function frameLength(b: Uint8Array, i: number) {
  if (i + 4 > b.length || b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) return 0;
  const version = (b[i + 1] >> 3) & 3; // 3 = MPEG1, 2 = MPEG2, 0 = MPEG2.5
  const layer = (b[i + 1] >> 1) & 3; // 1 = Layer III
  const br = (b[i + 2] >> 4) & 15;
  const sr = (b[i + 2] >> 2) & 3;
  const pad = (b[i + 2] >> 1) & 1;
  if (version === 1 || layer !== 1 || br === 0 || br === 15 || sr === 3) return 0;
  const bitrate = (version === 3 ? BITRATES_V1_L3 : BITRATES_V2_L3)[br] * 1000;
  const rate = RATES[version][sr];
  return Math.floor(((version === 3 ? 144 : 72) * bitrate) / rate) + pad;
}

function findFrames(b: Uint8Array, start: number) {
  const limit = Math.min(b.length - 4, start + 64 * 1024);
  for (let i = start; i < limit; i++) {
    const len = frameLength(b, i);
    if (len > 0 && frameLength(b, i + len) > 0) return true;
  }
  return false;
}
