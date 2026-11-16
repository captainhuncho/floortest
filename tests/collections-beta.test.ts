import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-collections-beta-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("callouts have no cap: a desk starts as many as it wants (owner, 16 Nov)", async () => {
  const { q } = await import("../src/lib/db");
  const { addCollection } = await import("../src/lib/desk");
  const t = Date.now();
  const desk = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('d@x.io', 'h', 'D', 'dd', 'free', 'UTC', ?) RETURNING id", t))!.id;
  const made = await Promise.all(["One", "Two", "Three", "Four", "Five"].map((n) => addCollection(desk, n)));
  assert.equal(made.filter((id) => Number.isSafeInteger(id)).length, 5, "every create gets an id, even at the same instant");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM collections WHERE user_id = ?", desk), 5);
});

test("more callouts never add room: the plan's track allowance counts across all of them, and each callout keeps its own cap and closing date", async () => {
  delete process.env.S3_BUCKET;
  delete process.env.SCAN_URL;
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const { addCollection } = await import("../src/lib/desk");
  const { startUpload } = await import("../src/lib/intake");
  const t = Date.now();
  const meta = (email: string) => ({
    name: "S", email, title: "T", artist: "A", message: "", releaseStatus: "unsigned", aiUse: "none", mixStatus: "mastered", genre: "House", originalName: "t.wav", emailConfirmed: true,
  });
  await q.run("UPDATE plans SET track_limit = 50 WHERE id = 'pro'");
  const desk = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('lim@x.io', 'h', 'L', 'limdesk', 'pro', 'UTC', ?, ?) RETURNING id", t, t))!.id;
  const ids = await Promise.all(["A", "B", "C", "Closed", "Full"].map((n) => addCollection(desk, n)));
  const [a, b, c, closed, full] = ids;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 'old@x.io', 'O', ?) RETURNING id", desk, t))!.id;
  const sendTo = async (col: number, email: string) => {
    await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", col, desk);
    const receiver = (await q.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, desk))! as never;
    return startUpload(receiver, meta(email), 1000, "1.1.1.1");
  };

  // Each callout's own rules still hold.
  await q.run("UPDATE collections SET closes_at = ? WHERE id = ?", t - 1000, closed);
  await q.run("UPDATE collections SET max_tracks = 1, full_at = ? WHERE id = ?", t, full);
  await assert.rejects(sendTo(closed, "c1@x.io"), /callout closed/);
  await assert.rejects(sendTo(full, "f1@x.io"), /callout is full/);

  // A desk at its allowance (two tracks, spread over two callouts) is refused on the third callout and every later one.
  await q.run("UPDATE plans SET track_limit = 2 WHERE id = 'pro'");
  for (const [i, col] of [a, b].entries())
    await q.run("INSERT INTO tracks (user_id, sender_id, collection_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,?,'T','A',?,'audio/a.wav','a.wav','audio/wav',1,?)", desk, sender, col, `lim-tok-${i}`, t);
  await assert.rejects(sendTo(c, "three@x.io"), /isn't accepting new tracks/);
  const more = await addCollection(desk, "Another");
  await assert.rejects(sendTo(more, "four@x.io"), /isn't accepting new tracks/);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM uploads WHERE receiver_id = ?", desk), 0, "refused starts hold nothing");
});
