import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// One send, one email (owner, 29 Oct). A throwaway local database and storage folder, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-send-receipts-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.S3_BUCKET;
delete process.env.SCAN_URL;

/** A small valid 16-bit mono WAV; a different length per track so none is flagged as a duplicate. */
function wav(samples: number) {
  const b = Buffer.alloc(44 + samples * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + samples * 2, 4);
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
  b.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i++) b.writeInt16LE(Math.round(Math.sin(i / 10) * 3000), 44 + i * 2);
  return new Uint8Array(b);
}

async function setup(handle: string) {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { completeUpload } = await import("../src/lib/intake");
  const store = await storage();
  const t = Date.now();
  const uid = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at, notify_submissions) VALUES (?,'h','Rae',?,'pro','UTC',?,?,'instant') RETURNING id",
    `${handle}@desk.io`,
    handle,
    t,
    t,
  ))!.id;
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Open', ?) RETURNING id", uid, t))!.id;
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", col, uid);
  const receiver = (await q.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, uid))!;
  let n = 0;
  /** Stores a file and its upload as the send page would, then completes it. `bad` stores something that isn't audio. */
  const send = async (title: string, extra: Record<string, unknown> = {}, bad = false) => {
    const id = `${handle}-${title}`.replace(/\W/g, "-");
    const file = bad ? new Uint8Array(Buffer.from("not audio at all ".repeat(40))) : wav(8000 + 100 * ++n);
    const key = `audio/${uid}/${id}.wav`;
    await store.put(key, file, "audio/wav");
    const meta = { name: "Ade", email: `ade@${handle}.io`, title, artist: "Ade", message: "", releaseStatus: "unsigned", aiUse: "none", mixStatus: "mastered", genre: "House", originalName: "t.wav", emailConfirmed: true, ...extra };
    await q.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES (?,?,?,?,?,?,?,?)", id, uid, key, ".wav", file.length, JSON.stringify(meta), "x", Date.now());
    return completeUpload(receiver as never, id, { duration: null, bpm: null, peaks: null });
  };
  const mail = (to: string) => q.all<{ subject: string; body: string }>("SELECT subject, body FROM outbox WHERE to_email = ? ORDER BY id", to);
  return { q, send, toSender: () => mail(`ade@${handle}.io`), toReceiver: () => mail(`${handle}@desk.io`) };
}

test("a send of 3 tracks makes one email to the sender listing all 3, and one to the receiver", async () => {
  const { send, toSender, toReceiver, q } = await setup("three");
  const batch = "batchAAAAAAAAAAAAAAAA";
  await send("One", { batch, sendSize: 3 });
  await send("Two", { batch, sendSize: 3 });
  assert.equal((await toSender()).length, 0, "nothing until the send's last track is saved");
  assert.equal((await toReceiver()).length, 0);
  await send("Three", { batch, sendSize: 3 });

  const sender = await toSender();
  assert.equal(sender.length, 1, "one email for the whole send");
  assert.equal(sender[0].subject, "Delivered: 3 tracks to Rae");
  for (const title of ["One", "Two", "Three"]) assert.match(sender[0].body, new RegExp(`Ade – ${title}\\n  Receipt: `));
  assert.equal(sender[0].body.match(/Receipt: /g)?.length, 3, "a receipt link per track");
  assert.ok(sender[0].body.indexOf("One") < sender[0].body.indexOf("Two") && sender[0].body.indexOf("Two") < sender[0].body.indexOf("Three"), "in the order sent");
  assert.doesNotMatch(sender[0].body, /receipt\/[A-Za-z0-9_-]{12,}/, "private links are hidden in the stored copy");

  const receiver = await toReceiver();
  assert.equal(receiver.length, 1, "one email to the receiver");
  assert.equal(receiver[0].subject, "New tracks: Ade sent 3");
  for (const title of ["One", "Two", "Three"]) assert.match(receiver[0].body, new RegExp(`• Ade – ${title}`));
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM tracks WHERE batch_id = ? AND (receipt_due_at IS NOT NULL OR receiver_notified_at IS NULL)", batch), 0);

  // The bell: one row for the send, listing the tracks.
  const { notificationsFor } = await import("../src/lib/notifications");
  const { USER_COLUMNS } = await import("../src/lib/db");
  const desk = (await q.get(`SELECT ${USER_COLUMNS} FROM users WHERE handle = 'three'`))!;
  const bell = (await notificationsFor(desk as never)).items.filter((n) => n.id.startsWith("e"));
  assert.deepEqual(bell.map((n) => [n.title, n.detail]), [["3 new tracks from Ade", "One, Two, Three · Open"]]);
});

test("the bell: a send of several is one row; single sends and auto-deletions keep their own", async () => {
  const { bellRows } = await import("../src/lib/notifications");
  const ev = (id: number, type: string, title: string, send: string | null) => ({ id, type, track_id: id * 10, created_at: id * 1000, title, sender: "Ade", collection: null, send });
  const rows = bellRows([ev(6, "submitted", "Solo", "b:y"), ev(5, "submitted", "C", "b:x"), ev(4, "expired", "Old", "b:z"), ev(3, "submitted", "B", "b:x"), ev(2, "submitted", "A", "b:x"), ev(1, "submitted", "Plain", null)], 3500);
  assert.deepEqual(
    rows.map((r) => [r.title, r.detail, r.unread]),
    [
      ["New track: Solo", "from Ade", true],
      ["3 new tracks from Ade", "A, B, C", true],
      ["Auto-deleted: Old", "Not kept within the retention period", true],
      ["New track: Plain", "from Ade", false],
    ],
  );
  assert.equal(rows[1].href, "/dashboard/review?view=queue&s=all&t=20", "opens the send's first track");
});

test("one track makes one email each way, worded as before", async () => {
  const { send, toSender, toReceiver } = await setup("single");
  await send("Solo", { batch: "batchBBBBBBBBBBBBBBBB", sendSize: 1 });
  await send("Plain");
  const sender = await toSender();
  assert.deepEqual(sender.map((m) => m.subject), ["Delivered: Ade – Solo", "Delivered: Ade – Plain"]);
  assert.match(sender[0].body, /"Solo" was delivered to Rae for Open\./);
  assert.deepEqual((await toReceiver()).map((m) => m.subject), ["New track: Ade – Solo", "New track: Ade – Plain"]);
});

test("a refused track is left out, and the rest go once the wait is over", async () => {
  const { send, toSender, toReceiver } = await setup("partial");
  const { sendDueReceipts, GROUP_WAIT_MS } = await import("../src/lib/send-receipts");
  const batch = "batchCCCCCCCCCCCCCCCC";
  await send("Good One", { batch, sendSize: 3 });
  await assert.rejects(send("Broken", { batch, sendSize: 3 }, true), /audio|WAV|MP3|file/i);
  await send("Good Two", { batch, sendSize: 3 });
  assert.equal((await toSender()).length, 0, "waiting for the third, which never comes");

  assert.equal(await sendDueReceipts(Date.now()), 0, "not before the wait is over");
  assert.equal(await sendDueReceipts(Date.now() + GROUP_WAIT_MS + 1000), 1);
  const sender = await toSender();
  assert.equal(sender.length, 1);
  assert.equal(sender[0].subject, "Delivered: 2 tracks to Rae");
  assert.match(sender[0].body, /Good One/);
  assert.match(sender[0].body, /Good Two/);
  assert.doesNotMatch(sender[0].body, /Broken/, "never a receipt for a track that failed");
  assert.equal((await toReceiver()).length, 1);

  // Run again: nothing more; a late track of the same send gets its own email.
  assert.equal(await sendDueReceipts(Date.now() + GROUP_WAIT_MS + 1000), 0);
  await send("Late", { batch, sendSize: 3 });
  assert.deepEqual((await toSender()).map((m) => m.subject), ["Delivered: 2 tracks to Rae", "Delivered: Ade – Late"]);
});

test("a folder (EP) sent together makes one email each way", async () => {
  const { send, toSender, toReceiver } = await setup("folder");
  const release = { id: "7-releaseDDDDDDDDDDDDDD", title: "Night EP", artist: "Ade", kind: "ep" };
  await send("Side A", { release, sendSize: 2, trackNo: 1 });
  assert.equal((await toSender()).length, 0);
  await send("Side B", { release, sendSize: 2, trackNo: 2 });
  assert.deepEqual((await toSender()).map((m) => m.subject), ["Delivered: 2 tracks to Rae"]);
  assert.deepEqual((await toReceiver()).map((m) => m.subject), ["New tracks: Ade sent 2"]);
});
