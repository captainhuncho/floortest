import assert from "node:assert/strict";
import { test } from "node:test";
import { validateAudio } from "../src/lib/validate";

const reader = (b: Uint8Array) => ({ size: b.length, read: async (s: number, e: number) => b.slice(s, e + 1) });

function wav() {
  const n = 1000;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22); b.writeUInt32LE(44100, 24); b.writeUInt32LE(176400, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34);
  b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  return new Uint8Array(b);
}

/** Two back-to-back MPEG-1 Layer III frames at 128 kbps / 44.1 kHz (417 bytes each). */
function mp3() {
  const frame = new Uint8Array(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  const b = new Uint8Array(417 * 3);
  b.set(frame, 0); b.set(frame, 417); b.set(frame, 834);
  return b;
}

test("accepts real WAV and MP3 structure", async () => {
  assert.deepEqual(await validateAudio(reader(wav())), { ok: true, kind: "wav" });
  assert.deepEqual(await validateAudio(reader(mp3())), { ok: true, kind: "mp3" });
});

test("rejects disguised and truncated files", async () => {
  const exe = new TextEncoder().encode("MZ\x90\x00 this is an executable");
  assert.equal((await validateAudio(reader(exe))).ok, false);
  assert.equal((await validateAudio(reader(wav().slice(0, 30)))).ok, false);
  const oneFrame = mp3().slice(0, 420); // a lone sync word is not enough
  assert.equal((await validateAudio(reader(oneFrame))).ok, false);
});

const join = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};
const junk = (n: number) => new Uint8Array(n).fill(0x4d); // stand-in for a hidden payload

test("rejects files with a payload hidden after real audio", async () => {
  assert.equal((await validateAudio(reader(join(wav(), junk(400 * 1024))))).ok, false);
  // A long MP3 whose last 64 KB is not audio or a tag.
  const frames = new Uint8Array(417 * 3000);
  for (let i = 0; i < 3000; i++) frames.set([0xff, 0xfb, 0x90, 0x00], i * 417);
  assert.equal((await validateAudio(reader(join(frames, junk(128 * 1024))))).ok, false);
  assert.deepEqual(await validateAudio(reader(frames)), { ok: true, kind: "mp3" });
});

test("allows normal trailing metadata and streaming WAV headers", async () => {
  assert.deepEqual(await validateAudio(reader(join(wav(), junk(4096)))), { ok: true, kind: "wav" });
  const streaming = wav();
  new DataView(streaming.buffer).setUint32(4, 0xffffffff, true);
  assert.deepEqual(await validateAudio(reader(join(streaming, junk(400 * 1024)))), { ok: true, kind: "wav" });
  const frames = new Uint8Array(417 * 3000);
  for (let i = 0; i < 3000; i++) frames.set([0xff, 0xfb, 0x90, 0x00], i * 417);
  const id3v1 = new TextEncoder().encode("TAG" + " ".repeat(125));
  assert.deepEqual(await validateAudio(reader(join(frames, id3v1))), { ok: true, kind: "mp3" });
});
