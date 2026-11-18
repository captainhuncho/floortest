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
test("erasing someone by email removes them from share links: place, visits, plays, open requests, codes, limits; a block stays and still refuses", async () => {
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
  await q.run("INSERT INTO link_requests (link_id, collection_id, email, name, note, status, created_at) VALUES (?, ?, 'goner@label.com', 'N', '', 'declined', ?)", link, coll, t);
  // Older rows can hold the address as it was typed.
  await q.run("INSERT INTO link_events (link_id, email, kind, created_at) VALUES (?, 'Goner@LABEL.com', 'code_unlisted', ?)", link, t);
  await q.run(
    "INSERT INTO link_sessions (link_id, email, token_hash, generation, notice_version, accepted_at, created_at, expires_at) VALUES (?, 'GONER@label.com', 's-gm', 1, 'v1', ?, ?, ?)",
    link, t, t, t + DAY,
  );
  // Recipients added by domain or by account aren't the erased person's own rows: they must stay.
  const other = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('acct@erase.io', 'h', 'A', 'eraseacct', 'free', 'UTC', ?, ?) RETURNING id",
    t, t,
  ))!.id;
  await q.run("INSERT INTO link_recipients (link_id, kind, value, permission, added_at) VALUES (?, 'domain', 'label.com', 'listen', ?)", link, t);
  await q.run("INSERT INTO link_recipients (link_id, kind, value, permission, added_at) VALUES (?, 'user', ?, 'listen', ?)", link, String(other), t);
  // Their per-email code and request limits, next to someone else's and a per-connection one.
  const { allow } = await import("../src/lib/ratelimit");
  for (const [bucket, key] of [["link_code_email", "goner@label.com"], ["link_request_email", "goner@label.com"], ["link_code_email", "stays@label.com"], ["link_code_ip", "10.1.1.1"]])
    await allow(bucket, key, 5, DAY);
  const desk = { id: owner, actor_id: owner };
  assert.ok(JSON.stringify(await linksFor(desk, coll)).includes("goner@label.com"));

  await eraseSender("Goner@Label.com");

  const left = (table: string, email: string) => q.count(`SELECT COUNT(*) AS n FROM ${table} WHERE lower(email) = ?`, email);
  for (const table of ["link_sessions", "link_events", "link_codes"]) assert.equal(await left(table, "goner@label.com"), 0, `${table} cleared`);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM link_recipients WHERE kind = 'email' AND value = 'goner@label.com'"), 0, "their place on the link is gone");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM link_requests WHERE email = 'goner@label.com' AND status = 'pending'"), 0, "open request gone");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM link_requests WHERE email = 'goner@label.com' AND status = 'blocked'"), 1, "a block stays, so it still holds");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM link_requests WHERE email = 'goner@label.com' AND status = 'declined'"), 1, "a declined request stays too");
  assert.ok(!JSON.stringify(await linksFor(desk, coll)).includes("goner@label.com"), "the link page no longer names them");

  // Someone else on the same link is untouched.
  for (const table of ["link_sessions", "link_events", "link_codes", "link_requests"]) assert.equal(await left(table, "stays@label.com"), 1, `${table} kept for others`);
  assert.ok(JSON.stringify(await linksFor(desk, coll)).includes("stays@label.com"));
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM link_recipients WHERE link_id = ? AND kind = 'domain' AND value = 'label.com'", link), 1, "the domain recipient stays");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM link_recipients WHERE link_id = ? AND kind = 'user' AND value = ?", link, String(other)), 1, "the account recipient stays");

  // Their rate limits went; everyone else's stayed.
  const limits = (bucket: string, key: string) => q.count("SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ? AND key = ?", bucket, key);
  assert.equal(await limits("link_code_email", "goner@label.com"), 0);
  assert.equal(await limits("link_request_email", "goner@label.com"), 0);
  assert.equal(await limits("link_code_email", "stays@label.com"), 1);
  assert.equal(await limits("link_code_ip", "10.1.1.1"), 1);

  // A data request for the address now finds no place of their own on a list, no activity, and only the kept decisions.
  const { linkDataFor } = await import("../src/lib/share-links");
  const data = await linkDataFor("goner@label.com", null);
  assert.deepEqual(data.onLists.map((r) => r.kind), ["domain"], "only the domain-wide entry, which isn't theirs");
  assert.deepEqual(data.activity, []);
  assert.deepEqual(data.requests.map((r) => r.status).sort(), ["blocked", "declined"]);

  // The block still refuses a new request from the same address.
  const { requestAccess, LinkError } = await import("../src/lib/share-links");
  await q.run("UPDATE collection_links SET requests_on = 1 WHERE id = ?", link);
  const row = (await q.get<Record<string, unknown>>("SELECT * FROM collection_links WHERE id = ?", link))!;
  await assert.rejects(
    () => requestAccess(row as never, { email: "GONER@label.com", userId: null, name: "N", note: "", ip: "10.2.2.2" }),
    (e: unknown) => e instanceof LinkError && /can't request/.test(e.message),
  );
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM link_requests WHERE email = 'goner@label.com' AND status = 'pending'"), 0, "no new request");
});

test("the email erase refuses an empty or partial address and deletes nothing; new link events store the address normalised", async () => {
  const { q } = await import("../src/lib/db");
  const { eraseSender } = await import("../src/lib/privacy");
  const { forgetLinkEmail, logLinkEvent } = await import("../src/lib/share-links");
  const before = await q.count("SELECT COUNT(*) AS n FROM link_sessions");
  await assert.rejects(() => eraseSender("   "), /Not an email/);
  await q.tx((db) => forgetLinkEmail(db, ""));
  await q.tx((db) => forgetLinkEmail(db, "label.com"));
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM link_sessions"), before, "nothing deleted");

  const owner = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('own2@erase.io', 'h', 'O', 'eraseown2', 'pro', 'UTC', ?, ?) RETURNING id",
    t, t,
  ))!.id;
  const coll = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Own', ?) RETURNING id", owner, t))!.id;
  const link = (await q.get<{ id: number }>("INSERT INTO collection_links (collection_id, created_by, token_hash, permission, generation, created_at) VALUES (?, ?, 'hash-erase-own', 'listen', 1, ?) RETURNING id", coll, owner, t))!.id;
  await logLinkEvent(link, "code_unlisted", { email: "  Typed@Label.COM " });
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM link_events WHERE email = 'typed@label.com'"), 1);
});
