import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-erase-link-email-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.S3_BUCKET;

const t = Date.now();
const DAY = 86_400_000;

// Safety, 16 Nov: erasing someone by email (no account) left them on other people's share links, named by email.
test("erasing someone by email removes them from share links: place, visits, plays, open requests, codes; a block stays", async () => {
  const { q } = await import("../src/lib/db");
  const { eraseSender } = await import("../src/lib/privacy");
  const { linksFor } = await import("../src/lib/share-links");
  const owner = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('own@erase.io', 'h', 'O', 'eraseown', 'pro', 'UTC', ?, ?) RETURNING id",
    t, t,
  ))!.id;
  const coll = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Promo', ?) RETURNING id", owner, t))!.id;
  const link = (await q.get<{ id: number }>("INSERT INTO collection_links (collection_id, created_by, token_hash, permission, generation, created_at) VALUES (?, ?, 'hash-erase-email', 'listen', 1, ?) RETURNING id", coll, owner, t))!.id;
  const seed = async (email: string, n: string) => {
    await q.run("INSERT INTO link_recipients (link_id, kind, value, permission, added_at) VALUES (?, 'email', ?, 'listen', ?)", link, email, t);
    await q.run(
      "INSERT INTO link_sessions (link_id, email, token_hash, generation, notice_version, accepted_at, created_at, expires_at) VALUES (?, ?, ?, 1, 'v1', ?, ?, ?)",
      link, email, `s-${n}`, t, t, t + DAY,
    );
    await q.run("INSERT INTO link_events (link_id, email, kind, created_at) VALUES (?, ?, 'downloaded', ?)", link, email, t);
    await q.run("INSERT INTO link_codes (link_id, email, code_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, ?, 0, ?)", link, email, `c-${n}`, t + DAY, t);
    await q.run("INSERT INTO link_requests (link_id, collection_id, email, name, note, status, created_at) VALUES (?, ?, ?, 'N', '', 'pending', ?)", link, coll, email, t);
  };
  await seed("goner@label.com", "g");
  await seed("stays@label.com", "s");
  await q.run("INSERT INTO link_requests (link_id, collection_id, email, name, note, status, created_at) VALUES (?, ?, 'goner@label.com', 'N', '', 'blocked', ?)", link, coll, t);
  const desk = { id: owner, actor_id: owner };
  assert.ok(JSON.stringify(await linksFor(desk, coll)).includes("goner@label.com"));

  await eraseSender("Goner@Label.com");

  const left = (table: string, email: string) => q.count(`SELECT COUNT(*) AS n FROM ${table} WHERE email = ?`, email);
  for (const table of ["link_sessions", "link_events", "link_codes"]) assert.equal(await left(table, "goner@label.com"), 0, `${table} cleared`);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM link_recipients WHERE kind = 'email' AND value = 'goner@label.com'"), 0, "their place on the link is gone");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM link_requests WHERE email = 'goner@label.com' AND status = 'pending'"), 0, "open request gone");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM link_requests WHERE email = 'goner@label.com' AND status = 'blocked'"), 1, "a block stays, so it still holds");
  assert.ok(!JSON.stringify(await linksFor(desk, coll)).includes("goner@label.com"), "the link page no longer names them");

  // Someone else on the same link is untouched.
  for (const table of ["link_sessions", "link_events", "link_codes", "link_requests"]) assert.equal(await left(table, "stays@label.com"), 1, `${table} kept for others`);
  assert.ok(JSON.stringify(await linksFor(desk, coll)).includes("stays@label.com"));
});
