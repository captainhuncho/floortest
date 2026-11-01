import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-contact-history-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// 1 Nov: one contact's page loaded every track (whole rows) and every reply and note they ever had. The counts still
// cover everything; the track list and the conversation are the latest ones only.
test("a contact's page counts every track but lists the latest 50 tracks and 200 messages", async () => {
  const { q } = await import("../src/lib/db");
  const { contactHistory, tracksShown, MAX_MESSAGES, TRACK_PAGE } = await import("../src/lib/contact");
  const t0 = 1_700_000_000_000;
  const desk = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('ch@desk.io', 'h', 'C', 'chdesk', 'pro', 'UTC', ?) RETURNING id", t0))!.id;
  const sender = async (email: string) => (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, 'S', ?) RETURNING id", desk, email, t0))!.id;
  const sam = await sender("sam@ch.io");
  const other = await sender("other@ch.io");
  for (let i = 0; i < 60; i++)
    await q.run(
      `INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, message, decision, downloaded_at)
       VALUES (?,?,?,'A',?,'audio/x.wav','x.wav','audio/wav',1,?,?,?,?)`,
      desk, sam, `T${i}`, `tok-ch-${i}`, t0 + i * 1000, i % 2 ? "" : `m${i}`, i < 7 ? "kept" : null, i < 3 ? t0 : null,
    );
  await q.run("INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, message) VALUES (?,?,'Theirs','A','tok-ch-o','audio/o.wav','o.wav','audio/wav',1,?,'not sam')", desk, other, t0);
  // 30 track messages plus 180 notes: 210 in all, more than the conversation shows.
  for (let i = 0; i < 180; i++)
    await q.run("INSERT INTO events (user_id, sender_id, track_id, type, detail, created_at) VALUES (?,?,NULL,'note',?,?)", desk, sam, `n${i}`, t0 + 100_000 + i);

  const h = await contactHistory(sam, tracksShown(undefined));
  assert.deepEqual([h.sent, h.kept, h.downloaded], [60, 7, 3], "counts cover every track");
  assert.equal(h.firstSent, t0);
  assert.equal(h.lastSent, t0 + 59_000);
  assert.equal(h.tracks.length, TRACK_PAGE);
  assert.equal(h.tracks[0].title, "T59", "newest first");
  assert.ok(!("token" in h.tracks[0]) && !("file_key" in h.tracks[0]), "only the columns the page shows");
  assert.equal((await contactHistory(sam, tracksShown("51"))).tracks.length, 60, "Show more rounds up to the next page");

  assert.equal(h.thread.length, MAX_MESSAGES);
  assert.equal(h.olderMessages, true);
  assert.equal(h.thread.at(-1)!.text, "n179", "the newest is last");
  assert.ok(h.thread.every((m, i) => i === 0 || m.at >= h.thread[i - 1].at), "oldest first");
  assert.ok(!h.thread.some((m) => m.text === "not sam"), "another sender's messages stay out");

  assert.equal(tracksShown("-5"), TRACK_PAGE);
  assert.equal(tracksShown("999999"), 1000);
  const quiet = await contactHistory(other, TRACK_PAGE);
  assert.deepEqual([quiet.sent, quiet.thread.length, quiet.olderMessages], [1, 1, false]);
});
