import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-held-uploads-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;
// A scanner that stays down is waited for this long (the real wait is 150 s).
process.env.SCAN_DEADLINE_MS = "400";

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

/** A fake scanner Worker: asleep or awake, and what each scan answers. Records every request. */
async function fakeScanner() {
  const state = { awake: false, answer: "clean" as "clean" | "infected" | "down", seen: [] as string[] };
  const server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      state.seen.push(`${req.method} ${req.url}`);
      const send = (status: number, body: unknown) => res.writeHead(status, { "Content-Type": "application/json" }).end(JSON.stringify(body));
      if (req.url === "/status") return send(200, { worker: true, container: state.awake ? "healthy" : "stopped" });
      if (req.url === "/wake") {
        state.awake = state.answer !== "down";
        return send(202, { waking: true });
      }
      if (state.answer === "down") return send(503, { error: "Scanner starting" });
      state.awake = true;
      send(200, state.answer === "infected" ? { clean: false, signature: "Eicar-Test-Signature" } : { clean: true });
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  process.env.SCAN_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SCAN_SECRET = "s".repeat(40);
  return {
    state,
    close: () => {
      server.close();
      server.closeAllConnections();
    },
  };
}

test("hold and scan: an asleep scanner holds the upload without waking; the batch wakes it once, delivers, refuses, waits and gives up", async () => {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { completeUpload, HELD_TTL, UploadHeld } = await import("../src/lib/intake");
  const { heldUploads, scanHeldUploads } = await import("../src/lib/held-uploads");
  const store = await storage();
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('r@x.io','h','Rae','rae','pro','UTC',?,?) RETURNING id", t, t))!.id;
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Open', ?) RETURNING id", uid, t))!.id;
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", col, uid);
  const receiver = (await q.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, uid))!;
  const file = wav();
  const upload = async (id: string, title: string) => {
    const key = `audio/${uid}/${id}.wav`;
    await store.put(key, file, "audio/wav");
    const meta = { name: "S", email: `${id}@sender.io`, title, artist: "A", message: "", releaseStatus: "unsigned", aiUse: "none", mixStatus: "mastered", genre: "House", originalName: "t.wav", emailConfirmed: true };
    await q.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES (?,?,?,?,?,?,?,?)", id, uid, key, ".wav", file.length, JSON.stringify(meta), "x", Date.now());
  };
  const hold = (id: string) => assert.rejects(completeUpload(receiver as never, id, { duration: 61, bpm: 124, peaks: null }), (e: unknown) => e instanceof UploadHeld);
  const tracks = () => q.all<{ title: string; duration: number | null }>("SELECT title, duration FROM tracks ORDER BY id");
  const keyOf = async (id: string) => (await q.get<{ file_key: string }>("SELECT file_key FROM uploads WHERE id = ?", id))!.file_key;
  const mailTo = (to: string) => q.get<{ subject: string }>("SELECT subject FROM outbox WHERE to_email = ? ORDER BY id DESC LIMIT 1", to);
  const fake = await fakeScanner();
  try {
    // 1. Asleep: both sends are held at once; nothing scanned and nothing woken for single files; no tracks.
    await upload("a1", "First");
    await upload("a2", "Second");
    await hold("a1");
    await hold("a2");
    assert.deepEqual(fake.state.seen, ["GET /status", "GET /status"], "asked whether it's awake, never woke it or scanned");
    assert.equal((await tracks()).length, 0, "nothing reaches the desk unscanned");
    assert.equal((await heldUploads()).count, 2);

    // 2. The batch: one wake-up, both scanned clean, both delivered with the analysis kept from the request.
    fake.state.seen = [];
    assert.deepEqual(await scanHeldUploads(), { delivered: 2, refused: 0, gaveUp: 0, waiting: 0 });
    assert.equal(fake.state.seen.filter((s) => s === "POST /wake").length, 1, "one wake-up for the whole batch");
    assert.deepEqual((await tracks()).map((r) => [r.title, Number(r.duration)]), [["First", 61], ["Second", 61]]);
    assert.equal((await heldUploads()).count, 0);
    fake.state.seen = [];
    assert.equal((await scanHeldUploads()).delivered, 0);
    assert.deepEqual(fake.state.seen, [], "an empty queue doesn't wake the scanner");

    // 3. Flagged in the batch: discarded, no track, the sender is emailed.
    fake.state.awake = false;
    await upload("b1", "Bad");
    await hold("b1");
    const sealedB1 = await keyOf("b1");
    assert.ok(await store.head(sealedB1), "the held file is kept, sealed");
    fake.state.answer = "infected";
    assert.deepEqual(await scanHeldUploads(), { delivered: 0, refused: 1, gaveUp: 0, waiting: 0 });
    assert.equal(await store.head(sealedB1), null, "the flagged file is gone");
    assert.equal((await tracks()).length, 2);
    assert.match((await mailTo("b1@sender.io"))?.subject ?? "", /wasn't sent: Bad/);

    // 4. Scanner still down after waiting: they stay held (one try counted) for the next run.
    fake.state.answer = "down";
    fake.state.awake = false;
    await upload("c1", "Waiting One");
    await upload("c2", "Waiting Two");
    await hold("c1");
    await hold("c2");
    const sealedC1First = await keyOf("c1");
    assert.deepEqual(await scanHeldUploads(), { delivered: 0, refused: 0, gaveUp: 0, waiting: 2 });
    assert.equal(await keyOf("c1"), sealedC1First, "a held file is sealed once, not copied again on every try");
    assert.equal((await q.get<{ held_tries: number }>("SELECT held_tries FROM uploads WHERE id = 'c1'"))?.held_tries, 1);
    assert.equal((await tracks()).length, 2, "still nothing unscanned on the desk");

    // 5. Held for a day: the sender is told to send again, and the file is deleted; the younger one waits on.
    await q.run("UPDATE uploads SET held_at = ? WHERE id = 'c1'", Date.now() - HELD_TTL - 1);
    const sealedC1 = await keyOf("c1");
    assert.equal((await scanHeldUploads()).gaveUp, 1);
    assert.equal(await q.get("SELECT 1 FROM uploads WHERE id = 'c1'"), undefined);
    assert.equal(await store.head(sealedC1), null, "its file is deleted");
    assert.match((await mailTo("c1@sender.io"))?.subject ?? "", /wasn't sent: Waiting One/);
    assert.ok(await q.get("SELECT 1 FROM uploads WHERE id = 'c2'"), "the younger one is still held");
  } finally {
    fake.close();
    delete process.env.SCAN_URL;
  }
});

test("hold and scan: a database failure in the batch is never counted as delivered, and the time budget leaves the rest held", async () => {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { completeUpload, UploadHeld } = await import("../src/lib/intake");
  const { scanHeldUploads } = await import("../src/lib/held-uploads");
  const { failOnce } = await import("./fail-once");
  const store = await storage();
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('d@x.io','h','Dee','dee','pro','UTC',?,?) RETURNING id", t, t))!.id;
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Open', ?) RETURNING id", uid, t))!.id;
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", col, uid);
  const receiver = (await q.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, uid))!;
  const file = wav();
  const held = async (id: string) => {
    const key = `audio/${uid}/${id}.wav`;
    await store.put(key, file, "audio/wav");
    const meta = { name: "S", email: `${id}@sender.io`, title: id, artist: "A", message: "", releaseStatus: "unsigned", aiUse: "none", mixStatus: "mastered", genre: "House", originalName: "t.wav", emailConfirmed: true };
    await q.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES (?,?,?,?,?,?,?,?)", id, uid, key, ".wav", file.length, JSON.stringify(meta), "x", Date.now());
    await assert.rejects(completeUpload(receiver as never, id, { duration: 61, bpm: 124, peaks: null }), (e: unknown) => e instanceof UploadHeld);
  };
  const tracks = () => q.count("SELECT COUNT(*) AS n FROM tracks WHERE user_id = ?", uid);
  const incidents = () => q.count("SELECT COUNT(*) AS n FROM incidents WHERE kind = 'upload_failed'");
  // Only this test's uploads: anything still held from the test above would be scanned first.
  await q.run("DELETE FROM uploads");
  const fake = await fakeScanner();
  try {
    // 1. The connection drops while the track is saved: not delivered, still held with its file, and an incident.
    await held("d1");
    const before = await incidents();
    let restore = failOnce(q as never, /INSERT INTO tracks/);
    let out;
    try {
      out = await scanHeldUploads();
    } finally {
      restore();
    }
    assert.equal(out.delivered, 0, "nothing was delivered");
    assert.equal(await tracks(), 0);
    const row = await q.get<{ file_key: string }>("SELECT file_key FROM uploads WHERE id = 'd1' AND held_at IS NOT NULL");
    assert.ok(row && (await store.head(row.file_key)), "still held, file kept, for the next run");
    assert.equal(await incidents(), before + 1);

    // 2. The upload vanished and no track was made: counted as lost, with an incident and an email to the sender.
    await q.run("UPDATE uploads SET claimed_at = NULL WHERE id = 'd1'");
    restore = failOnce(q as never, /INSERT INTO tracks/);
    const { run } = q;
    q.run = async (sql: string, ...args: unknown[]) =>
      /SET claimed_at = NULL WHERE id/.test(sql) ? run.call(q, "DELETE FROM uploads WHERE id = ?", ...args.slice(-1)) : run.call(q, sql, ...args);
    try {
      out = await scanHeldUploads();
    } finally {
      q.run = run;
      restore();
    }
    assert.equal(out.delivered, 0, "a vanished upload with no track is not 'delivered'");
    assert.equal(out.refused, 1);
    assert.equal(await incidents(), before + 2);
    assert.match((await q.get<{ subject: string }>("SELECT subject FROM outbox WHERE to_email = 'd1@sender.io' ORDER BY id DESC LIMIT 1"))?.subject ?? "", /wasn't sent: d1/);

    // 3. Not enough time left in the run: nothing is started, the scanner isn't woken, both wait for the next run.
    fake.state.awake = false;
    await held("e1");
    await held("e2");
    fake.state.seen = [];
    out = await scanHeldUploads(undefined, { until: Date.now() + 10_000 });
    assert.deepEqual(out, { delivered: 0, refused: 0, gaveUp: 0, waiting: 2 });
    assert.equal(fake.state.seen.filter((s) => s === "POST /wake").length, 0, "not woken for a run that can't finish");
    assert.equal(await tracks(), 0);
  } finally {
    fake.close();
    delete process.env.SCAN_URL;
  }
});

test("hold and scan for stems: a stem sent while the scanner sleeps is held, then attached by the batch; a flagged one is refused and its sender emailed", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { UploadHeld } = await import("../src/lib/intake");
  const { scanHeldUploads } = await import("../src/lib/held-uploads");
  const S = await import("../src/lib/stems");
  const store = await storage();
  await q.run("DELETE FROM uploads"); // what the first test left held
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('st@x.io','h','Sol','sol','pro','UTC',?,?) RETURNING id", t, t))!.id;
  await q.run("INSERT INTO feature_switches (feature, plans, users, updated_at) VALUES ('stems', '[]', ?, ?) ON CONFLICT (feature) DO UPDATE SET users = excluded.users", JSON.stringify([uid]), t);
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 'stemsender@x.io', 'S', ?) RETURNING id", uid, t))!.id;
  await q.run(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, stems_requested_at) VALUES (?,?,'T','A','stem-track','audio/x.wav','x.wav','audio/wav',1,?,?)",
    uid, sender, t, t,
  );
  const trackId = (await q.get<{ id: number }>("SELECT id FROM tracks WHERE token = 'stem-track'"))!.id;
  const file = wav();
  const send = async (name: string) => {
    const { uploadId } = await S.startStemUpload("stem-track", name, file.length, "2.2.2.2");
    const key = (await q.get<{ file_key: string }>("SELECT file_key FROM uploads WHERE id = ?", uploadId))!.file_key;
    await store.put(key, file, "audio/wav");
    return S.completeStemUpload("stem-track", uploadId);
  };
  const fake = await fakeScanner();
  try {
    // Asleep: held, nothing attached, and neither starting nor finishing the upload woke the scanner.
    await assert.rejects(send("drums.wav"), (e: unknown) => e instanceof UploadHeld);
    assert.deepEqual(fake.state.seen, ["GET /status"]);
    assert.equal((await S.stemsFor(trackId)).length, 0, "nothing unscanned on the track");

    // The batch wakes it and attaches the stem; the receipt lists it.
    assert.deepEqual(await scanHeldUploads(), { delivered: 1, refused: 0, gaveUp: 0, waiting: 0 });
    assert.deepEqual((await S.stemsFor(trackId)).map((s) => s.name), ["drums.wav"]);
    assert.deepEqual(S.stemsSent((await q.get<{ stems_sent: string | null }>("SELECT stems_sent FROM tracks WHERE id = ?", trackId))!), ["drums.wav"]);

    // Flagged in the batch: not attached, and the sender (found through the track) is emailed.
    fake.state.awake = false;
    await assert.rejects(send("bad.wav"), (e: unknown) => e instanceof UploadHeld);
    fake.state.answer = "infected";
    assert.deepEqual(await scanHeldUploads(), { delivered: 0, refused: 1, gaveUp: 0, waiting: 0 });
    assert.equal((await S.stemsFor(trackId)).length, 1);
    const mail = await q.get<{ subject: string; body: string }>("SELECT subject, body FROM outbox WHERE to_email = 'stemsender@x.io' ORDER BY id DESC LIMIT 1");
    assert.match(mail?.subject ?? "", /Your stem wasn't sent: bad\.wav/);
  } finally {
    fake.close();
    delete process.env.SCAN_URL;
  }
});
