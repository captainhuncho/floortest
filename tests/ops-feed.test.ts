import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-ops-feed-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// Ops shell → live feed (ops redesign B, 1 Nov): one read per 30 s for everyone, then each viewer sees only what they may
// open; never ops sign-ins.
test("live feed: per-viewer kinds, no ops sign-ins, one read per 30 s", async () => {
  const { q } = await import("../src/lib/db");
  const { feedFor, feedRows, FEED_TTL_MS } = await import("../src/lib/ops-feed");
  const { ROLE_PERMS } = await import("../src/lib/ops-perms");
  const t = Date.now() - 3_600_000;

  const u = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('ama@feed.io', 'h', 'Ama', 'ama', 'free', 'UTC', ?) RETURNING id", t))!.id;
  const s = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@feed.io', 'S', ?) RETURNING id", u, t))!.id;
  await q.run("INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'T','A','tok','k','b.wav','audio/wav',1,?)", u, s, t + 1_000);
  await q.run("INSERT INTO takedowns (track_label, claimant, claimant_email, created_at) VALUES ('A – T', 'Label', 'l@x.io', ?)", t + 2_000);
  await q.run("INSERT INTO admin_log (admin_id, action, target, created_at) VALUES (?, 'suspended', '@spam', ?)", u, t + 3_000);
  await q.run("INSERT INTO admin_log (admin_id, action, target, created_at) VALUES (?, 'signed in to ops', '', ?)", u, t + 4_000);

  const now = Date.now();
  const rows = await feedRows(now);
  assert.deepEqual(rows.map((r) => r.kind), ["admin", "takedown", "first", "signup"], "newest first, no ops sign-in");
  assert.equal(rows[0].text, "suspended · @spam");
  assert.equal(rows.find((r) => r.kind === "signup")!.href, `/admin/accounts/${u}`);

  const superAdmin = { super: true as const, role: "super" as const, perms: new Set<never>() };
  assert.equal(feedFor(superAdmin, rows).length, 4);
  // Support (users.read, no super): people's activity, not takedowns or the admin log.
  const care = { super: false as const, role: "care" as const, perms: new Set(ROLE_PERMS.care) };
  assert.deepEqual(feedFor(care, rows).map((r) => r.kind), ["first", "signup"]);
  // Developer (no users.read): nothing about people.
  const dev = { super: false as const, role: "developer" as const, perms: new Set(ROLE_PERMS.developer) };
  assert.deepEqual(feedFor(dev, rows), []);

  // Cached for FEED_TTL_MS: a new row shows only after it.
  await q.run("INSERT INTO takedowns (track_label, claimant, claimant_email, created_at) VALUES ('B – U', 'Label', 'l@x.io', ?)", t + 5_000);
  assert.equal((await feedRows(now + 1_000)).filter((r) => r.kind === "takedown").length, 1);
  assert.equal((await feedRows(now + FEED_TTL_MS)).filter((r) => r.kind === "takedown").length, 2);
});
