import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-analytics-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

const DAY = 86_400_000;

let ready: ReturnType<typeof makeSetup> | undefined;
const setup = () => (ready ??= makeSetup());

async function makeSetup() {
  const { q } = await import("../src/lib/db");
  const now = Date.now();
  const user = async (handle: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'team', 'UTC', ?, ?) RETURNING id",
      `${handle}@acct.io`, handle, handle, now, now - 400 * DAY,
    ))!.id;
  const a = await user("deska");
  const b = await user("deskb");
  const sender = async (desk: number, name: string) =>
    (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, ?, ?, ?) RETURNING id", desk, `${name.toLowerCase()}@s.io`, name, now))!.id;
  const callout = async (desk: number, name: string) => (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, ?, ?) RETURNING id", desk, name, now))!.id;
  let n = 0;
  const track = async (desk: number, from: number, at: number, extra: { collection?: number; decision?: "kept" | "passed"; downloaded?: number; playedOut?: number; deleted?: number } = {}) => {
    n++;
    return (await q.get<{ id: number }>(
      `INSERT INTO tracks (user_id, sender_id, collection_id, title, artist, token, file_key, original_name, mime, size, created_at, decision, decided_at, downloaded_at, played_out_at, deleted_at)
       VALUES (?,?,?,?,'A',?,'audio/x.wav','x.wav','audio/wav',1,?,?,?,?,?,?) RETURNING id`,
      desk, from, extra.collection ?? null, `T${n}`, `tok-${n}`, at, extra.decision ?? null, extra.decision ? at + 1000 : null, extra.downloaded ?? null, extra.playedOut ?? null, extra.deleted ?? null,
    ))!.id;
  };

  const kwame = await sender(a, "Kwame");
  const ama = await sender(a, "Ama");
  const other = await sender(b, "Other");
  const afro = await callout(a, "Afro House");
  const bCallout = await callout(b, "B callout");
  const t = now - 60_000;
  await track(a, kwame, t, { collection: afro, decision: "kept", downloaded: t + 5000 });
  await track(a, kwame, t, { collection: afro, decision: "passed" });
  await track(a, ama, t, { playedOut: t + 9000 });
  // Deleted after retention: the row stays, so it still counts.
  await track(a, ama, t - 2 * DAY, { deleted: t });
  // 40 days ago: inside the 30-day comparison span and Lifetime, not the last 30 days.
  await track(a, kwame, now - 40 * DAY);
  // Desk B: never in desk A's numbers.
  for (let i = 0; i < 4; i++) await track(b, other, t, { collection: bCallout, decision: "kept" });
  return { q, now, desk: (id: number, actor = id) => ({ id, actor_id: actor, tz: "UTC" }), a, b, afro, bCallout };
}

test("periods: only the five keys, calendar days in the desk's zone, the right comparison span", async () => {
  const A = await import("../src/lib/analytics");
  assert.equal(A.pickPeriod("7d"), "7d");
  assert.equal(A.pickPeriod("1 OR 1=1"), "30d", "anything else falls back");
  assert.equal(A.pickPeriod(undefined), "30d");

  const now = Date.UTC(2026, 10, 16, 15, 30); // 16 Nov 2026, 15:30 UTC
  const week = A.periodRange("7d", "UTC", now);
  assert.equal(week.from, Date.UTC(2026, 10, 10), "today plus the six days before, from midnight");
  assert.deepEqual(week.prev, { from: Date.UTC(2026, 10, 3), to: Date.UTC(2026, 10, 10) });
  assert.equal(week.bucket, "day");
  assert.equal(A.periodRange("90d", "UTC", now).bucket, "week");
  const year = A.periodRange("year", "UTC", now);
  assert.equal(year.from, Date.UTC(2026, 0, 1));
  assert.deepEqual(year.prev, { from: Date.UTC(2025, 0, 1), to: Date.UTC(2025, 10, 16, 15, 30) }, "the same span last year");
  assert.equal(A.periodRange("1 OR 1=1", "UTC", now).period, "30d", "a bad period falls back");
  assert.equal(A.periodRange("7d", "Not/AZone'; DROP", now).tz, "UTC", "a bad time zone reads as UTC");
  const life = A.periodRange("all", "UTC", now);
  assert.equal(life.from, 0);
  assert.equal(life.prev, null);

  // Accra is UTC+0, London is UTC+0 in November and UTC+1 in summer; Tokyo is UTC+9 all year.
  // 15:30 UTC on the 16th is already the 17th in Tokyo, so its seven days start at midnight on the 11th, Tokyo time.
  assert.equal(A.periodRange("7d", "Asia/Tokyo", now).from, Date.UTC(2026, 10, 11) - 9 * 3_600_000);
  assert.equal(A.dayStart("2026-07-01", "Europe/London"), Date.UTC(2026, 5, 30, 23));
  assert.equal(A.dayKey(Date.UTC(2026, 10, 16, 16), "Asia/Tokyo"), "2026-11-17");
});

test("perDay: the desk's own tracks only; bars add up to the totals; deleted tracks still count; comparison span", async () => {
  const A = await import("../src/lib/analytics");
  const { desk, a, b, now } = await setup();
  const range = A.periodRange("30d", "UTC", now);
  const r = await A.perDay(desk(a), range);
  assert.deepEqual(r.totals, { in: 4, senders: 2, kept: 1, passed: 1, downloaded: 1, playedOut: 1 });
  assert.equal(r.bars.length, 30);
  assert.equal(r.bars.reduce((n, x) => n + x.in, 0), r.totals.in, "the bars add up to the totals");
  assert.deepEqual(Object.keys(r.bars[0]).sort(), ["downloaded", "in", "kept", "key", "label", "passed", "playedOut", "senders"]);
  assert.deepEqual(r.prev, { in: 1, senders: 1, kept: 0, passed: 0, downloaded: 0, playedOut: 0 }, "40 days ago is in the span before");

  const life = await A.perDay(desk(a), A.periodRange("all", "UTC", now));
  assert.equal(life.totals.in, 5);
  assert.equal(life.prev, null);

  const other = await A.perDay(desk(b), range);
  assert.equal(other.totals.in, 4);
  assert.equal(other.totals.kept, 4);
});

test("whoSent and calloutLinks: names and counts for this desk only, no emails", async () => {
  const A = await import("../src/lib/analytics");
  const { desk, a, afro, now } = await setup();
  const range = A.periodRange("30d", "UTC", now);
  const who = await A.whoSent(desk(a), range);
  assert.equal(who.total, 2);
  assert.deepEqual(who.rows, [
    { name: "Kwame", tracks: 2, kept: 1 },
    { name: "Ama", tracks: 2, kept: 0 },
  ], "most tracks first, then most kept");
  assert.equal((await A.whoSent(desk(a), range, 1)).rows.length, 1, "the limit holds");
  assert.ok(!JSON.stringify(who).includes("@"), "no sender email leaves the server");

  assert.deepEqual(await A.calloutLinks(desk(a), range), [{ id: afro, name: "Afro House", tracks: 2, senders: 1 }]);
});

test("sharedLinks: per person on this desk's links only, in the span", async () => {
  const A = await import("../src/lib/analytics");
  const { q, desk, a, b, afro, bCallout, now } = await setup();
  const link = async (collection: number, by: number) =>
    (await q.get<{ id: number }>(
      "INSERT INTO collection_links (collection_id, created_by, token_hash, permission, generation, created_at) VALUES (?, ?, ?, 'download', 1, ?) RETURNING id",
      collection, by, `hash-${collection}-${by}-${Math.random()}`, now,
    ))!.id;
  const mine = await link(afro, a);
  const theirs = await link(bCallout, b);
  let s = 0;
  const visit = async (l: number, email: string, at: number) =>
    q.run(
      "INSERT INTO link_sessions (link_id, email, token_hash, generation, notice_version, accepted_at, created_at, expires_at) VALUES (?, ?, ?, 1, 'v1', ?, ?, ?)",
      l, email, `s-${++s}`, at, at, at + DAY,
    );
  const event = (l: number, email: string, kind: string, at: number, track: number | null = null) =>
    q.run("INSERT INTO link_events (link_id, email, kind, track_id, created_at) VALUES (?, ?, ?, ?, ?)", l, email, kind, track, at);
  const tracks = (await q.all<{ id: number }>("SELECT id FROM tracks WHERE user_id = ? ORDER BY id LIMIT 2", a)).map((r) => Number(r.id));
  const t = now - 60_000;
  await visit(mine, "boss@label.com", t);
  await visit(mine, "boss@label.com", t + 1);
  await event(mine, "boss@label.com", "listened", t, tracks[0]);
  await event(mine, "boss@label.com", "listened", t, tracks[0]);
  await event(mine, "boss@label.com", "listened", t, tracks[1]);
  await event(mine, "boss@label.com", "downloaded", t, tracks[0]);
  await event(mine, "boss@label.com", "probed", t);
  await visit(mine, "old@label.com", now - 50 * DAY);
  await visit(theirs, "spy@else.com", t);
  await event(theirs, "spy@else.com", "downloaded", t);

  const { rows, truncated } = await A.sharedLinks(desk(a), A.periodRange("30d", "UTC", now));
  assert.equal(truncated, false);
  assert.deepEqual(rows, [{ who: "boss@label.com", opened: 2, played: 2, downloaded: 1 }], "two visits, two tracks played, one download; other desks and old visits left out");
  assert.equal((await A.sharedLinks(desk(a), A.periodRange("all", "UTC", now))).rows.length, 2, "Lifetime includes the old visit");
  assert.deepEqual((await A.sharedLinks(desk(b), A.periodRange("30d", "UTC", now))).rows.map((r) => r.who), ["spy@else.com"]);
});

test("guards: a Member gets no numbers; an erased sender's name is gone; a share recipient shows as @username, or Removed while their account is being deleted", async () => {
  const A = await import("../src/lib/analytics");
  const { eraseSender } = await import("../src/lib/privacy");
  const { q, desk, a, afro, now } = await setup();
  const range = A.periodRange("30d", "UTC", now);
  // The role is read from the database, never taken from the Desk: a Member, a stranger and a paused admin get nothing.
  const mate = async (handle: string, role: "admin" | "member", twofa: boolean) => {
    const id = (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, totp_enabled_at, created_at) VALUES (?, 'h', ?, ?, 'free', 'UTC', ?, ?, ?) RETURNING id",
      `${handle}@mate.io`, handle, handle, now, twofa ? now : null, now,
    ))!.id;
    await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, ?, ?)", a, id, role, now);
    return id;
  };
  const member = await mate("mem", "member", true);
  const noTwoStep = await mate("adm-no2", "admin", false);
  const admin = await mate("adm", "admin", true);
  const stranger = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES ('str@x.io', 'h', 'S', 'strngr', 'free', 'UTC', ?, ?) RETURNING id", now, now))!.id;
  for (const actor of [member, noTwoStep, stranger]) {
    for (const run of [() => A.perDay(desk(a, actor), range), () => A.whoSent(desk(a, actor), range), () => A.calloutLinks(desk(a, actor), range), () => A.sharedLinks(desk(a, actor), range)]) {
      await assert.rejects(run, /owner and A&R \/ Admins/);
    }
  }
  assert.ok((await A.perDay(desk(a, admin), range)).totals.in >= 0, "an A&R / Admin with two-step is let in");
  assert.equal((await A.whoSent(desk(a), range, Number.NaN)).rows.length <= 10, true, "a bad limit falls back to 10, no database error");

  // Erasing a sender deletes them and their tracks (privacy.ts eraseSender): their name leaves Analytics.
  const gone = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 'erase@s.io', 'Erase Me', ?) RETURNING id", a, now))!.id;
  await q.run("INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'E','A','tok-erase','audio/e.wav','e.wav','audio/wav',1,?)", a, gone, now - 1000);
  assert.ok((await A.whoSent(desk(a), range, 200)).rows.some((r) => r.name === "Erase Me"));
  await eraseSender("erase@s.io");
  assert.ok(!(await A.whoSent(desk(a), range, 200)).rows.some((r) => r.name === "Erase Me"), "erased: no name");

  // A recipient with an account shows as @username, never the account's email; while that account is being deleted, Removed.
  const listener = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES ('private@acct.io', 'h', 'Lis', 'lisner', 'free', 'UTC', ?, ?) RETURNING id",
    now, now,
  ))!.id;
  const link = (await q.get<{ id: number }>("INSERT INTO collection_links (collection_id, created_by, token_hash, permission, generation, created_at) VALUES (?, ?, 'hash-guard', 'listen', 1, ?) RETURNING id", afro, a, now))!.id;
  await q.run(
    "INSERT INTO link_sessions (link_id, email, user_id, token_hash, generation, notice_version, accepted_at, created_at, expires_at) VALUES (?, 'private@acct.io', ?, 's-guard', 1, 'v1', ?, ?, ?)",
    link, listener, now - 1000, now - 1000, now + DAY,
  );
  const named = (await A.sharedLinks(desk(a), range)).rows;
  assert.ok(named.some((r) => r.who === "@lisner"));
  assert.ok(!JSON.stringify(named).includes("private@acct.io"), "the account's email never shows");
  await q.run("UPDATE users SET deletion_requested_at = ? WHERE id = ?", now, listener);
  const removed = (await A.sharedLinks(desk(a), range)).rows;
  assert.ok(removed.some((r) => r.who === "Removed") && !removed.some((r) => r.who === "@lisner"), "being deleted: Removed");
});

test("analyticsDesk checks the time zone; an erased share recipient leaves Analytics; two people shown the same way stay apart", async () => {
  const A = await import("../src/lib/analytics");
  const { eraseSender } = await import("../src/lib/privacy");
  const { q, desk, a, afro, now } = await setup();
  const user = { id: a, actor_id: a } as Parameters<typeof A.analyticsDesk>[0];
  assert.equal(A.analyticsDesk(user, "Not/AZone").tz, "UTC", "a bad time zone reads as UTC");
  assert.equal(A.analyticsDesk(user, "Asia/Tokyo").tz, "Asia/Tokyo");
  assert.equal(A.analyticsDesk(user, null).tz, "UTC");
  assert.doesNotThrow(() => A.periodRange("7d", A.analyticsDesk(user, "bad zone").tz, now));

  const range = A.periodRange("30d", "UTC", now);
  const link = (await q.get<{ id: number }>("INSERT INTO collection_links (collection_id, created_by, token_hash, permission, generation, created_at) VALUES (?, ?, 'hash-erase', 'listen', 1, ?) RETURNING id", afro, a, now))!.id;
  const visit = (email: string, tok: string) =>
    q.run(
      "INSERT INTO link_sessions (link_id, email, token_hash, generation, notice_version, accepted_at, created_at, expires_at) VALUES (?, ?, ?, 1, 'v1', ?, ?, ?)",
      link, email, tok, now - 1000, now - 1000, now + DAY,
    );
  await visit("goner@label.com", "s-goner");
  await q.run("INSERT INTO link_events (link_id, email, kind, created_at) VALUES (?, 'goner@label.com', 'downloaded', ?)", link, now - 900);
  await q.run("INSERT INTO link_recipients (link_id, kind, value, permission, added_at) VALUES (?, 'email', 'goner@label.com', 'listen', ?)", link, now - 2000);
  const { linksFor } = await import("../src/lib/share-links");
  assert.ok((await A.sharedLinks(desk(a), range)).rows.some((r) => r.who === "goner@label.com"));
  assert.ok(JSON.stringify(await linksFor(desk(a), afro)).includes("goner@label.com"));
  await eraseSender("Goner@Label.com");
  assert.ok(!JSON.stringify(await A.sharedLinks(desk(a), range)).includes("goner@label.com"), "erased by email: their visits and plays are gone");
  assert.ok(!JSON.stringify(await linksFor(desk(a), afro)).includes("goner@label.com"), "and the link page no longer lists them");

  // Two accounts being deleted both show as Removed: grouped by account, not by the shown text.
  const acct = async (email: string) =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', 'Sam', ?, 'free', 'UTC', ?, ?) RETURNING id", email, email.split("@")[0], now, now))!.id;
  for (const [email, tok] of [["sam1@x.io", "s-sam1"], ["sam2@x.io", "s-sam2"]] as const) {
    const uid = await acct(email);
    await q.run(
      "INSERT INTO link_sessions (link_id, email, user_id, token_hash, generation, notice_version, accepted_at, created_at, expires_at) VALUES (?, ?, ?, ?, 1, 'v1', ?, ?, ?)",
      link, email, uid, tok, now - 1000, now - 1000, now + DAY,
    );
    await q.run("UPDATE users SET deletion_requested_at = ? WHERE id = ?", now, uid);
  }
  assert.equal((await A.sharedLinks(desk(a), range)).rows.filter((r) => r.who === "Removed").length >= 2, true, "two people, two rows, even with the same shown name");

  // A visit made before sign-in (no user_id) by an account now being deleted shows as Removed, not its email.
  await visit("sam1@x.io", "s-sam1-pre");
  assert.ok(!JSON.stringify(await A.sharedLinks(desk(a), range)).includes("sam1@x.io"), "pre-sign-in visit of a deleting account: Removed");

  // Deleting an account (purgeAccount) removes its visits from Analytics.
  const { purgeAccount } = await import("../src/lib/privacy");
  const before = (await A.sharedLinks(desk(a), range)).rows.filter((r) => r.who === "Removed").length;
  const sam2 = (await q.get<{ id: number }>("SELECT id FROM users WHERE email = 'sam2@x.io'"))!.id;
  await purgeAccount(sam2);
  assert.equal((await A.sharedLinks(desk(a), range)).rows.filter((r) => r.who === "Removed").length, before - 1, "deleted account: its row is gone");
});
