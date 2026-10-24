import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and storage folder for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-integrity-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;
delete process.env.SCAN_URL;
delete process.env.RESEND_API_KEY;

/** A small valid 16-bit mono WAV. */
function wav() {
  const n = 8000;
  const b = Buffer.alloc(44 + n * 2);
  b.write("RIFF", 0); b.writeUInt32LE(36 + n * 2, 4); b.write("WAVE", 8); b.write("fmt ", 12);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(8000, 24);
  b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write("data", 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), 44 + i * 2);
  return new Uint8Array(b);
}

const desk = async (handle: string) => {
  const { q } = await import("../src/lib/db");
  const t = Date.now();
  return (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'pro', 'UTC', ?, ?) RETURNING id",
    `${handle}@x.io`, handle, handle, t, t,
  ))!.id;
};

test("a completion asked again after it worked returns the same track, not a second one", async () => {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { completeUpload } = await import("../src/lib/intake");
  const store = await storage();
  const t = Date.now();
  const uid = await desk("again");
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Open', ?) RETURNING id", uid, t))!.id;
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", col, uid);
  const receiver = (await q.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, uid))! as never;
  const file = wav();
  const key = `audio/${uid}/again.wav`;
  await store.put(key, file, "audio/wav");
  // The owner's own upload path (a sender's runs after-response work that needs a live request); both go through the
  // same check, which returns before anything is sent or created again.
  const meta = { name: "S", email: "s@x.io", title: "Lost reply", artist: "A", message: "", releaseStatus: "unsigned", aiUse: "none", mixStatus: "mastered", genre: "House", originalName: "t.wav", ownerCollectionId: col };
  await q.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES ('up-again', ?, ?, '.wav', ?, ?, '5.5.5.5', ?)", uid, key, file.length, JSON.stringify(meta), t);
  const analysis = { duration: 1, bpm: null, peaks: null };

  const first = await completeUpload(receiver, "up-again", analysis);
  const second = await completeUpload(receiver, "up-again", analysis);
  assert.equal(second.id, first.id, "the same track");
  assert.equal(second.token, first.token, "so the sender's receipt link is the same");
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM tracks WHERE user_id = ?", uid), 1);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM events WHERE track_id = ? AND type = 'submitted'", first.id), 1, "one Delivered record");
  assert.equal((await q.get<{ upload_ref: string }>("SELECT upload_ref FROM tracks WHERE id = ?", first.id))!.upload_ref.includes("up-again"), false, "only a fingerprint is kept");
  await assert.rejects(completeUpload(receiver, "never-made", analysis), /expired/, "an unknown upload still fails");
});

test("an action claimed once runs once inside its window, then again after it", async () => {
  const { claimOnce } = await import("../src/lib/once");
  const t = Date.now();
  assert.equal(await claimOnce("reply", [1, 1, 7, null, "Thanks"], 600_000, t), true);
  assert.equal(await claimOnce("reply", [1, 1, 7, null, "Thanks"], 600_000, t + 1000), false, "the double tap");
  assert.equal(await claimOnce("reply", [1, 1, 7, null, "Thanks again"], 600_000, t + 1000), true, "a different reply");
  assert.equal(await claimOnce("reply", [1, 1, 8, null, "Thanks"], 600_000, t + 1000), true, "to another sender");
  assert.equal(await claimOnce("reply", [1, 1, 7, null, "Thanks"], 600_000, t + 600_001), true, "the same words later on");
});

test("the database keeps a track's sender and collection on its own desk, and sizes at zero or more", async () => {
  const { q } = await import("../src/lib/db");
  const t = Date.now();
  const a = await desk("deska");
  const b = await desk("deskb");
  const senderOf = async (u: number) => (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", u, t))!.id;
  const colOf = async (u: number) => (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'C', ?) RETURNING id", u, t))!.id;
  const [sa, sb, ca, cb] = [await senderOf(a), await senderOf(b), await colOf(a), await colOf(b)];
  const track = (u: number, s: number, c: number | null, size = 1, token = `tk-${Math.random()}`) =>
    q.get<{ id: number }>(
      "INSERT INTO tracks (user_id, sender_id, collection_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,?,'T','A',?,'k','a.wav','audio/wav',?,?) RETURNING id",
      u, s, c, token, size, t,
    );
  const ok = (await track(a, sa, ca))!.id;
  await assert.rejects(track(a, sb, ca), /tracks_sender_same_desk/, "another desk's sender");
  await assert.rejects(track(a, sa, cb), /tracks_collection_same_desk/, "another desk's collection");
  await assert.rejects(q.run("UPDATE tracks SET collection_id = ? WHERE id = ?", cb, ok), /tracks_collection_same_desk/, "moved into another desk's collection");
  await assert.rejects(track(a, sa, ca, -1), /tracks_size_positive/, "a negative size");
  await assert.rejects(q.run("UPDATE tracks SET duration = -3 WHERE id = ?", ok), /tracks_duration_ok/);
  await assert.rejects(
    q.run("INSERT INTO events (user_id, sender_id, track_id, type, detail, created_at) VALUES (?, ?, ?, 'note', '', ?)", a, sb, ok, t),
    /events_sender_same_desk/,
    "an event filed against another desk's sender",
  );
  // Deleting a collection still only empties the track's collection, never its owner.
  await q.run("DELETE FROM collections WHERE id = ?", ca);
  const after = await q.get<{ user_id: number; collection_id: number | null }>("SELECT user_id, collection_id FROM tracks WHERE id = ?", ok);
  assert.deepEqual({ ...after }, { user_id: a, collection_id: null });
});

test("one live invite per email per team: a new one replaces the old", async () => {
  const { q } = await import("../src/lib/db");
  const t = Date.now();
  const team = await desk("teamdesk");
  const invite = (hash: string, email = "pal@x.io") =>
    q.run("INSERT INTO account_invites (account_id, email, role, token_hash, created_at, expires_at) VALUES (?, ?, 'member', ?, ?, ?)", team, email, hash, t, t + 1000);
  await invite("h1");
  await assert.rejects(invite("h2"), /account_invites_one_live/, "a second live invite");
  await assert.rejects(invite("h3", "PAL@x.io"), /account_invites_one_live/, "whatever the capitals");
  await q.run("UPDATE account_invites SET revoked_at = ? WHERE token_hash = 'h1'", t);
  await invite("h4");
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM account_invites WHERE account_id = ? AND revoked_at IS NULL", team), 1);
});

test("playback links handed to the browser or app last 5 minutes at most", async () => {
  const { q } = await import("../src/lib/db");
  const { fileAccess } = await import("../src/lib/file-access");
  const t = Date.now();
  const uid = await desk("linkdesk");
  const s = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", uid, t))!.id;
  const id = (await q.get<{ id: number }>(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, art_key) VALUES (?,?,'T','A','tk-link','audio/x.wav','a.wav','audio/wav',1,?,'art/x.png') RETURNING id",
    uid, s, t,
  ))!.id;
  const me = { id: uid, plan: "pro" };
  for (const action of ["play", "download", "art", "offline"] as const) {
    const g = await fileAccess(me, action, id);
    if (g) assert.ok(g.maxLinkSeconds <= 300, `${action}: ${g.maxLinkSeconds}s`);
  }
});
