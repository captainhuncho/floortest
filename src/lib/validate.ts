/**
 * Structural validation of uploaded audio. This is not antivirus scanning: it rejects anything
 * that isn't a well-formed WAV or MPEG audio stream, which covers disguised executables, archives
 * and documents. It also checks the end of the file, so nothing can ride along after real audio
 * (a "polyglot" file). Files are only ever served as audio attachments, never executed.
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
    if (declared > 36 && declared !== 0xffffffff && file.size > riffEnd + TRAILER_ALLOWANCE) return { ok: false, reason: "This WAV file has unexpected data after the audio." };
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
        if (off + 8 + size > file.size + 1) return { ok: false, reason: "This WAV file looks incomplete or damaged." };
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
      return (await mp3TailOk(file)) ? { ok: true, kind: "mp3" } : { ok: false, reason: "This MP3 has unexpected data after the audio." };
    }
  }
  if (!findFrames(head, off)) return { ok: false, reason: "That file doesn't look like WAV or MP3 audio." };
  return (await mp3TailOk(file)) ? { ok: true, kind: "mp3" } : { ok: false, reason: "This MP3 has unexpected data after the audio." };
}

/** Room for padding and trailing metadata chunks (ID3, bext) after the declared audio. */
const TRAILER_ALLOWANCE = 256 * 1024;

/** The last part of an MP3 must still be audio frames or a known tag, not something appended. */
async function mp3TailOk(file: Reader) {
  if (file.size <= 1024 * 1024) return true; // already covered by the head read
  const start = Math.max(0, file.size - 64 * 1024);
  const tail = await file.read(start, file.size - 1);
  const text = String.fromCharCode(...tail.slice(-8192));
  if (/TAG|APETAGEX|LYRICS200|ID3/.test(text)) return true;
  return findFrames(tail, 0);
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
