import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-sender-history-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("a sender's history never says when a track left the desk", async () => {
  const { q } = await import("../src/lib/db");
  const { sentBy } = await import("../src/lib/sent");
  const t = Date.now();
  const DAY = 86_400_000;
  const user = async (handle: string) =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'pro', 'UTC', ?, ?) RETURNING id", `${handle}@x.io`, handle, handle, t, t))!.id;
  const receiver = await user("desk");
  const me = await user("me");
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, account_id, created_at) VALUES (?, 'me@x.io', 'Me', ?, ?) RETURNING id", receiver, me, t))!.id;
  const track = (title: string, decision: string | null, decidedAt: number | null, created: number, deleted: number | null) =>
    q.run(
      "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, decision, decided_at, deleted_at) VALUES (?,?,?,'A',?,'k','x.wav','audio/wav',1,?,?,?,?)",
      receiver, sender, title, `tok-${title}`, created, decision, decidedAt, deleted,
    );
  // Not for me 31 days ago (removed after 30), and one undecided for 40 days (still on the desk).
  await track("passed", "passed", t - 31 * DAY, t - 32 * DAY, t - DAY);
  await track("waiting", null, null, t - 40 * DAY, null);
  const rows = await sentBy({ id: me, email: "me@x.io", email_verified_at: t });
  assert.equal(rows.length, 2);
  for (const r of rows) assert.equal("deleted_at" in r, false, "removal date is never returned");
  // The two rows differ only in title: nothing in them separates the removed track from the waiting one.
  const strip = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([k]) => !["token", "title", "created_at"].includes(k)));
  assert.deepEqual(strip(rows[0]), strip(rows[1]));
});
