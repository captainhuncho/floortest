import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-scan-intake-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;

/** A small valid 16-bit mono WAV. */
function wav(seconds = 1) {
  const rate = 8000;
  const n = rate * seconds;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), 44 + i * 2);
  return new Uint8Array(b);
}

test("virus check in uploads: unavailable keeps the file for a retry, flagged discards it, clean lets the track in", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { completeUpload, IntakeError } = await import("../src/lib/intake");
  const { USER_COLUMNS } = await import("../src/lib/db");
  const store = await storage();
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('r@x.io','h','R','r','pro','UTC',?,?) RETURNING id", t, t))!.id;
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Open', ?) RETURNING id", uid, t))!.id;
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", col, uid);
  const receiver = (await q.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, uid))!;

  const file = wav();
  const meta = { name: "S", email: "s@x.io", title: "T", artist: "A", message: "", releaseStatus: "unsigned", aiUse: "none", mixStatus: "mastered", genre: "House", originalName: "t.wav", emailConfirmed: true };
  const upload = async (id: string) => {
    const key = `audio/${uid}/${id}.wav`;
    await store.put(key, file, "audio/wav");
    await q.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES (?,?,?,?,?,?,?,?)", id, uid, key, ".wav", file.length, JSON.stringify(meta), "x", Date.now());
  };
  const keyOf = async (id: string) => (await q.get<{ file_key: string }>("SELECT file_key FROM uploads WHERE id = ?", id))?.file_key ?? null;

  // A fake scanner whose answer we set per call.
  let answer: "down" | "infected" | "clean" = "down";
  const server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      res.writeHead(answer === "down" ? 502 : 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(answer === "infected" ? { clean: false, signature: "Eicar-Test-Signature" } : { clean: true }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  process.env.SCAN_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SCAN_SECRET = "s".repeat(40);
  // A scanner that stays down is waited for (it may be waking) until this deadline, then the upload is held.
  process.env.SCAN_DEADLINE_MS = "500";
  const analysis = { duration: 1, bpm: null, peaks: null };
  try {
    // Scanner down: refused with 503, no track, and the (sealed) file is still there for the retry.
    await upload("up1");
    await assert.rejects(completeUpload(receiver as never, "up1", analysis), (e: unknown) => e instanceof IntakeError && e.status === 503);
    const kept = await keyOf("up1");
    assert.ok(kept && (await store.head(kept)), "the file is kept while the scanner is down");
    assert.equal((await q.all("SELECT 1 FROM tracks")).length, 0);

    // The retry once the scanner is back: same upload, no second send, and the track arrives.
    answer = "clean";
    // completeUpload ends with Next's after() (follow-up emails), which needs a real request; the track is saved before it.
    await completeUpload(receiver as never, "up1", analysis).catch((e: Error) => assert.match(e.message, /outside a request scope/));
    assert.equal((await q.all("SELECT 1 FROM tracks")).length, 1, "the retry let the track in");

    // A flagged file: refused (422) and gone.
    answer = "infected";
    await upload("up2");
    await assert.rejects(completeUpload(receiver as never, "up2", analysis), (e: unknown) => e instanceof IntakeError && e.status === 422);
    assert.equal(await keyOf("up2"), null, "the upload record is gone");
    assert.equal(await store.head(`audio/${uid}/up2.wav`), null);
    assert.equal((await q.all("SELECT 1 FROM tracks")).length, 1);
  } finally {
    delete process.env.SCAN_URL;
    delete process.env.SCAN_DEADLINE_MS;
    server.close();
    server.closeAllConnections();
  }
});
