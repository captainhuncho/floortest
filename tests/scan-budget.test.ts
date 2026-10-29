import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-scan-budget-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;
process.env.SCAN_DEADLINE_MS = "400";

/** A small valid 16-bit mono WAV. */
function wav() {
  const n = 8000;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write("WAVE", 8);
  b.write("fmt ", 12);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write("data", 36);
  b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), 44 + i * 2);
  return new Uint8Array(b);
}

/** A fake scanner Worker that is awake or asleep, answers every scan clean, and records every request. */
async function fakeScanner() {
  const state = { awake: true, seen: [] as string[] };
  const server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      state.seen.push(`${req.method} ${req.url}`);
      const send = (status: number, body: unknown) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      if (req.url === "/status") return send(200, { worker: true, container: state.awake ? "healthy" : "stopped" });
      state.awake = true;
      if (req.url === "/wake") return send(202, { waking: true });
      send(200, { clean: true });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  process.env.SCAN_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SCAN_SECRET = "s".repeat(40);
  return { state, close: () => (server.close(), server.closeAllConnections()) };
}

test("one mailbox shares one scanner budget whatever its case or +tag, and the table never holds the email", async () => {
  const { senderScope } = await import("../src/lib/scan-budget");
  assert.equal(senderScope("Dj+one@Example.io", 1), senderScope("dj@example.io", 1));
  assert.notEqual(senderScope("dj@example.io", 1), senderScope("other@example.io", 1));
  assert.doesNotMatch(senderScope("dj@example.io", 1), /dj|example/);
  assert.equal(senderScope(undefined, 7), "desk:7");
});

test("scanner budget: a sender over their daily budget is held, not scanned, and doesn't wake the scanner; everyone's budget the same; the next day's budget lets them through", async () => {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { completeUpload, UploadHeld } = await import("../src/lib/intake");
  const { scanHeldUploads } = await import("../src/lib/held-uploads");
  const store = await storage();
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('r@x.io','h','Rae','rae','pro','UTC',?,?) RETURNING id", t, t))!.id;
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Open', ?) RETURNING id", uid, t))!.id;
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", col, uid);
  const receiver = (await q.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, uid))!;
  const file = wav();
  const upload = async (id: string, email: string) => {
    const key = `audio/${uid}/${id}.wav`;
    await store.put(key, file, "audio/wav");
    const meta = { name: "S", email, title: id, artist: "A", message: "", releaseStatus: "unsigned", aiUse: "none", mixStatus: "mastered", genre: "House", originalName: "t.wav", emailConfirmed: true };
    await q.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES (?,?,?,?,?,?,?,?)", id, uid, key, ".wav", file.length, JSON.stringify(meta), "x", Date.now());
    // completeUpload ends with Next's after() (follow-up emails), which needs a real request; the track is saved before it.
    return completeUpload(receiver as never, id, { duration: 1, bpm: null, peaks: null }).catch((e: Error) => {
      if (!/outside a request scope/.test(e.message)) throw e;
    });
  };
  const heldFor = (p: Promise<unknown>, reason: string) => assert.rejects(p, (e: unknown) => e instanceof UploadHeld && e.reason === reason);
  const tracks = async () => (await q.all<{ title: string }>("SELECT title FROM tracks ORDER BY id")).map((r) => r.title);
  const scans = (seen: string[]) => seen.filter((s) => s === "POST /scan").length;
  const incidents = (like: string) => q.all("SELECT 1 FROM incidents WHERE message LIKE ?", `%${like}%`);
  // The scanner going idle between sends, as far as the budget knows: the next charge pays a full 10 minutes again.
  const idle = () => q.run("UPDATE scanner_budget SET awake_until = 0 WHERE scope = 'all'");
  process.env.SCAN_BUDGET_SENDER_MINUTES = "15";
  const fake = await fakeScanner();
  try {
    // 1. A send while it's awake costs up to 10 minutes; one right after costs almost nothing. Both delivered.
    await upload("a1", "dj@sender.io");
    await upload("a2", "DJ+two@sender.io");
    assert.deepEqual(await tracks(), ["a1", "a2"]);

    // 2. Ten more minutes would take this mailbox past its 15: held, never scanned, one incident for the day.
    await idle();
    fake.state.seen = [];
    await heldFor(upload("a3", "dj+three@sender.io"), "budget");
    assert.equal(scans(fake.state.seen), 0, "the scanner isn't called for it");
    assert.deepEqual(await tracks(), ["a1", "a2"], "nothing reaches the desk unscanned");
    await heldFor(upload("a4", "dj@sender.io"), "budget");
    assert.equal((await incidents("daily virus-check budget")).length, 1, "ops is told once per sender per day");

    // 3. The batch neither wakes the scanner nor scans for them; another sender's held file still goes through.
    fake.state.awake = false;
    await heldFor(upload("b1", "other@sender.io"), "scanner");
    fake.state.seen = [];
    assert.deepEqual(await scanHeldUploads(), { delivered: 1, refused: 0, gaveUp: 0, waiting: 2 });
    assert.equal(fake.state.seen.filter((s) => s === "POST /wake").length, 1);
    assert.deepEqual(await tracks(), ["a1", "a2", "b1"]);

    // 4. Everyone's budget spent: nothing is woken or scanned, held files wait, and an urgent incident is recorded.
    process.env.SCAN_BUDGET_MINUTES = "20";
    await idle();
    fake.state.awake = false;
    await heldFor(upload("c1", "third@sender.io"), "scanner");
    fake.state.seen = [];
    assert.deepEqual(await scanHeldUploads(), { delivered: 0, refused: 0, gaveUp: 0, waiting: 3 });
    assert.deepEqual(fake.state.seen, [], "no wake-up and no scan over the budget");
    assert.equal((await incidents("scanner's daily budget is spent")).length, 1);

    // 5. The next day's budget: every held file is scanned and delivered.
    await q.run("UPDATE scanner_budget SET day = '2000-01-01'");
    delete process.env.SCAN_BUDGET_MINUTES;
    assert.deepEqual(await scanHeldUploads(), { delivered: 3, refused: 0, gaveUp: 0, waiting: 0 });
    assert.deepEqual((await tracks()).sort(), ["a1", "a2", "a3", "a4", "b1", "c1"]);
  } finally {
    fake.close();
    delete process.env.SCAN_URL;
    delete process.env.SCAN_BUDGET_SENDER_MINUTES;
    delete process.env.SCAN_BUDGET_MINUTES;
  }
});
