import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";
import { form, inRequest } from "./request-scope";

// Sign-up bot protection (Safety audit, 13 Nov; fix 2 and the 100-an-hour cap are the owner's yes, 13 Nov). Behaviour
// tests: each one runs the real sign-up action, upload code or nightly clean-up (Safety review of #535).
process.env.DATA_DIR = testDataDir("ft-signup-guard-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.S3_BUCKET;
// No bot check keys: the check can't run, so every sign-up here is "unchecked" unless a test sets them.
delete process.env.TURNSTILE_SITE_KEY;
delete process.env.TURNSTILE_SECRET_KEY;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PASSWORD = "violet-harbour-quartz-1987";
const BUSY = "Sign-up is busy right now. Try again later.";

let n = 0;
/** A complete, valid sign-up form with a fresh email and link name each time. */
function signupForm(extra: Record<string, string> = {}) {
  n++;
  return form({ first_name: "Dee", last_name: "Jay", email: `dj${n}@example.org`, handle: `djnew${n}`, password: PASSWORD, agree: "on", ...extra });
}

async function trySignup(ip: string, f: FormData) {
  const { signup } = await import("../src/app/(auth)/actions");
  return inRequest(new Map(), ip, () => signup(undefined as never, f));
}

const errorOf = (o: { answer?: unknown }) => (o.answer as { error?: string } | undefined)?.error;

async function count(bucket: string, key: string) {
  const { recentCount } = await import("../src/lib/ratelimit");
  return recentCount(bucket, key, DAY);
}

async function fill(bucket: string, key: string, times: number) {
  const { record } = await import("../src/lib/ratelimit");
  for (let i = 0; i < times; i++) await record(bucket, key);
}

async function clear(bucket: string) {
  const { q } = await import("../src/lib/db");
  await q.run("DELETE FROM rate_events WHERE bucket = ?", bucket);
}

async function openSignup() {
  const { q } = await import("../src/lib/db");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('open_signup', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", Date.now());
}

async function account(handle: string, verified: boolean, createdAt = Date.now()) {
  const { q } = await import("../src/lib/db");
  await q.run(
    "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, email_verified_at, created_at) VALUES (?, 'h', ?, ?, 'free', 'dj', 'UTC', ?, ?)",
    `${handle}@example.test`,
    handle,
    handle,
    verified ? createdAt : null,
    createdAt,
  );
  const { userByHandle } = await import("../src/lib/desk");
  return (await userByHandle(handle))!;
}

/** A receiver with an open collection, so only the unconfirmed-email rule can refuse a send. */
async function receiverWithCollection(handle: string, verified: boolean) {
  const { q } = await import("../src/lib/db");
  const u = await account(handle, verified);
  const col = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Open', ?) RETURNING id", u.id, Date.now()))!.id;
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", col, u.id);
  const { userByHandle } = await import("../src/lib/desk");
  return (await userByHandle(handle))!;
}

/** A small valid 16-bit mono WAV. */
function wav() {
  const rate = 8000;
  const b = Buffer.alloc(44 + rate * 2);
  b.write("RIFF", 0);
  b.writeUInt32LE(36 + rate * 2, 4);
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
  b.writeUInt32LE(rate * 2, 40);
  return b;
}

/** A file already in storage with its upload row, as if the sender's browser had finished the PUT. */
async function storedUpload(receiverId: number, id: string) {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const file = wav();
  const key = `audio/${receiverId}/${id}.wav`;
  await (await storage()).put(key, file, "audio/wav");
  const meta = { name: "S", email: `${id}@sender.io`, title: id, artist: "A", message: "", releaseStatus: "unsigned", aiUse: "none", mixStatus: "mastered", genre: "House", originalName: "t.wav", emailConfirmed: true };
  await q.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES (?,?,?,?,?,?,?,?)", id, receiverId, key, ".wav", file.length, JSON.stringify(meta), "x", Date.now());
}

test("fix 1: a failed bot check stops sign-up before anything is counted or created", async () => {
  await openSignup();
  process.env.TURNSTILE_SITE_KEY = "site";
  process.env.TURNSTILE_SECRET_KEY = "secret";
  try {
    const { BOT_MESSAGE } = await import("../src/lib/turnstile");
    const ip = "198.51.100.1";
    const out = await trySignup(ip, signupForm());
    assert.equal(errorOf(out), BOT_MESSAGE, "no token with the check on: refused");
    assert.equal(await count("signup_open_ip", ip), 0, "no unchecked slot used");
    const { q } = await import("../src/lib/db");
    assert.equal(await q.get("SELECT 1 FROM users WHERE email = ?", `dj${n}@example.org`), undefined, "no account");
  } finally {
    delete process.env.TURNSTILE_SITE_KEY;
    delete process.env.TURNSTILE_SECRET_KEY;
  }
});

test("fix 1: an unchecked sign-up goes on under the tight caps, and only sign-ups that would succeed use a slot", async () => {
  await openSignup();
  const ip = "198.51.100.7";
  // Rejected attempts first: a weak password, a missing field, a throwaway inbox (trailing dot too). None use a slot.
  assert.notEqual(errorOf(await trySignup(ip, signupForm({ password: "short" }))), BUSY);
  assert.notEqual(errorOf(await trySignup(ip, signupForm({ handle: "" }))), BUSY);
  assert.equal(errorOf(await trySignup(ip, signupForm({ email: "bot@mailinator.com." }))), "Use a permanent email address.");
  assert.equal(await count("signup_open_ip", ip), 0, "junk attempts can't use up the connection's two");
  assert.equal(await count("signup_open_all", "all"), 0, "or the site-wide fifty");
  // Two real sign-ups from this connection go through; the third is refused.
  for (let i = 1; i <= 2; i++) {
    const out = await trySignup(ip, signupForm());
    assert.ok(out.redirect, `unchecked sign-up ${i} goes through (${JSON.stringify(out)})`);
  }
  const third = await trySignup(ip, signupForm());
  assert.equal(errorOf(third), BUSY, "the third unchecked sign-up from one connection in a day is refused");
  const { q } = await import("../src/lib/db");
  assert.equal(await q.get("SELECT 1 FROM users WHERE email = ?", `dj${n}@example.org`), undefined, "and no account is made");
  assert.equal(await count("signup_open_all", "all"), 2);
  const { SIGNUP_CAPS } = await import("../src/lib/signup-guard");
  assert.equal(SIGNUP_CAPS.openIpDay, 2);
  assert.equal(SIGNUP_CAPS.openAllDay, 50);
  assert.ok(await q.get("SELECT 1 FROM incidents WHERE message LIKE 'Sign-up ran without a working bot check%'"), "the admins hear about it");
});

test("fix 1: when the site-wide unchecked cap is full, the connection's slot is handed back", async () => {
  await openSignup();
  await fill("signup_open_all", "all", 50 - (await count("signup_open_all", "all")));
  try {
    const ip = "198.51.100.8";
    assert.equal(errorOf(await trySignup(ip, signupForm())), BUSY);
    assert.equal(await count("signup_open_ip", ip), 0, "the connection keeps both its slots for tomorrow");
  } finally {
    await clear("signup_open_all");
  }
});

test("fix 1: an unchecked sign-up that fails at the last step (lost race, any error) hands both slots back", async () => {
  await openSignup();
  const { q } = await import("../src/lib/db");
  // Make the account insert fail the way a lost race does (duplicate key, 23505) or with any other error, for two emails.
  await q.run(`CREATE OR REPLACE FUNCTION test_signup_fail() RETURNS trigger AS $$
    BEGIN
      IF NEW.email = 'race@example.org' THEN RAISE EXCEPTION 'duplicate' USING ERRCODE = '23505'; END IF;
      IF NEW.email = 'boom@example.org' THEN RAISE EXCEPTION 'boom'; END IF;
      RETURN NEW;
    END $$ LANGUAGE plpgsql`);
  await q.run("CREATE TRIGGER test_signup_fail BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION test_signup_fail()");
  try {
    const ip = "198.51.100.9";
    const before = await count("signup_open_all", "all");
    const lost = await trySignup(ip, signupForm({ email: "race@example.org" }));
    assert.match(errorOf(lost) ?? "", /^We couldn't create an account with those details/, "a lost race reads as taken");
    await assert.rejects(trySignup(ip, signupForm({ email: "boom@example.org" })), /boom/, "any other error still surfaces");
    assert.equal(await count("signup_open_ip", ip), 0, "the connection's slots came back");
    assert.equal(await count("signup_open_all", "all"), before, "and the site-wide ones");
    const ok = await trySignup(ip, signupForm());
    assert.ok(ok.redirect, "so a real sign-up from the same connection still goes through");
  } finally {
    await q.run("DROP TRIGGER IF EXISTS test_signup_fail ON users");
    await q.run("DROP FUNCTION IF EXISTS test_signup_fail()");
  }
});

test("fix 3: a throwaway inbox is refused, with or without a trailing dot", async () => {
  const { isThrowawayEmail } = await import("../src/lib/signup-guard");
  const { normalEmail } = await import("../src/lib/email-normal");
  assert.equal(isThrowawayEmail("bot@mailinator.com"), true);
  assert.equal(isThrowawayEmail("bot@mailinator.com."), true, "a trailing dot is the same domain");
  assert.equal(isThrowawayEmail("bot@eu.mailinator.com"), true, "subdomains too");
  assert.equal(isThrowawayEmail("dj@gmail.com"), false);
  assert.equal(isThrowawayEmail("dj@notmailinator.com"), false, "a look-alike domain isn't caught by accident");
  assert.equal(normalEmail(" Bot@Mailinator.COM. "), "bot@mailinator.com", "the stored email drops the trailing dot");
});

test("fix 4: the 21st sign-up from one connection in a day is refused", async () => {
  await openSignup();
  const ip = "192.0.2.21";
  await fill("signup_ip_day", ip, 20);
  assert.equal(errorOf(await trySignup(ip, signupForm())), "Too many sign-ups from this connection. Try again tomorrow.");
  assert.equal(await count("signup_open_ip", ip), 0);
});

test("fix 4: the 101st sign-up in an hour, site-wide, is refused", async () => {
  await openSignup();
  await clear("signup_all");
  await fill("signup_all", "all", 100);
  try {
    const ip = "192.0.2.101";
    assert.equal(errorOf(await trySignup(ip, signupForm())), BUSY);
    assert.equal(await count("signup_open_ip", ip), 0, "refused by the hourly cap, before the unchecked slots");
  } finally {
    await clear("signup_all");
  }
});

test("fix 2: an unconfirmed account's link shows 'not open yet' and refuses an upload start and finish", async () => {
  const { calloutBlock, NOT_OPEN_YET } = await import("../src/lib/desk");
  const fresh = await receiverWithCollection("notyet", false);
  assert.equal(calloutBlock(fresh, undefined, false), "not_open");
  const { startUpload, completeUpload, IntakeError } = await import("../src/lib/intake");
  const meta = { name: "Sender", email: "sender@example.test", title: "T", artist: "A", message: "", releaseStatus: "", aiUse: "none", mixStatus: "", genre: "", originalName: "t.mp3" };
  const notOpen = (e: unknown) => e instanceof IntakeError && e.status === 403 && e.message === NOT_OPEN_YET("notyet");
  await assert.rejects(startUpload(fresh, meta, 1000, "203.0.113.9"), notOpen);
  const { q } = await import("../src/lib/db");
  assert.equal((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM uploads WHERE receiver_id = ?", fresh.id))!.n, 0, "nothing reserved");
  // An upload started before the rule (or by a stale page) can't finish into an unconfirmed desk either.
  await storedUpload(fresh.id, "upload-notyet-1");
  await assert.rejects(completeUpload(fresh, "upload-notyet-1", { duration: 61, bpm: 124, peaks: null }), notOpen);
  assert.equal((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM tracks WHERE user_id = ?", fresh.id))!.n, 0, "no track");
  const confirmed = await receiverWithCollection("confirmedone", true);
  assert.equal(calloutBlock(confirmed, undefined, false), null, "a confirmed account's link is open");
});

test("fix 2: the app's send routes refuse an unconfirmed receiver with 403", async () => {
  const { issueAppSession } = await import("../src/lib/app-auth");
  const { NOT_OPEN_YET } = await import("../src/lib/desk");
  const sender = await account("appsender", true);
  const receiver = await receiverWithCollection("notyetapp", false);
  const { accessToken } = await issueAppSession(sender.id, "Phone");
  const call = (path: string, body: object) =>
    new Request(`http://localhost${path}`, { method: "POST", headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  const start = await import("../src/app/api/v1/sends/route");
  const res = await start.POST(
    call("/api/v1/sends", { to: "notyetapp", title: "T", artist: "A", genre: "House", mix_status: "mastered", release_status: "unsigned", ai_use: "none", fileName: "t.wav", size: 1000 }),
  );
  const startBody = await res.json();
  assert.equal(res.status, 403, JSON.stringify(startBody));
  assert.equal(startBody.error, NOT_OPEN_YET("notyetapp"));
  await storedUpload(receiver.id, "upload-notyetapp-1");
  const complete = await import("../src/app/api/v1/sends/complete/route");
  const done = await complete.POST(call("/api/v1/sends/complete", { to: "notyetapp", uploadId: "upload-notyetapp-1" }));
  assert.equal(done.status, 403, JSON.stringify(await done.clone().json()));
});

test("fix 2: the nightly clean-up frees link names of empty accounts unconfirmed for 7 days, and holds each name 30 days", async () => {
  const { UNCONFIRMED_HANDLE_DAYS, FREED_HANDLE_HOLD_DAYS, cleanupRecords } = await import("../src/lib/retention");
  assert.equal(UNCONFIRMED_HANDLE_DAYS, 7);
  assert.equal(FREED_HANDLE_HOLD_DAYS, 30);
  const { q } = await import("../src/lib/db");
  const old = Date.now() - 8 * DAY;
  const stale = await account("staleone", false, old);
  const recent = await account("recentone", false, Date.now() - 6 * DAY);
  const kept = await account("keptone", true, old);
  const withTrack = await account("hastrack", false, old);
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", withTrack.id, old))!.id;
  await q.run(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (?,?,'T','A','tok-hastrack','k','t.wav','audio/wav',1,?)",
    withTrack.id,
    sender,
    old,
  );
  const withUpload = await account("hasupload", false, old);
  await q.run("INSERT INTO uploads (id, receiver_id, file_key, ext, size, meta, ip, created_at) VALUES ('up-hasupload',?,'k','.wav',1,'{}','x',?)", withUpload.id, old);
  await cleanupRecords();
  const handle = async (id: number) => (await q.get<{ handle: string }>("SELECT handle FROM users WHERE id = ?", id))!.handle;
  assert.equal(await handle(stale.id), `-u${stale.id}`, "freed; the account stays with a name nobody can type");
  assert.equal(await handle(recent.id), "recentone", "under 7 days: kept");
  assert.equal(await handle(kept.id), "keptone", "confirmed: kept");
  assert.equal(await handle(withTrack.id), "hastrack", "owns a track: kept");
  assert.equal(await handle(withUpload.id), "hasupload", "has received an upload: kept");
  const { handleHeld } = await import("../src/lib/accounts");
  assert.equal(await handleHeld("staleone"), true, "the freed name is held, so nobody can claim it at once");
  const hold = (await q.get<{ expires_at: number }>("SELECT expires_at FROM released_handles WHERE handle = 'staleone'"))!;
  assert.ok(Math.abs(Number(hold.expires_at) - (Date.now() + 30 * DAY)) < HOUR, "for 30 days");
  const taken = await trySignup("192.0.2.30", signupForm({ handle: "staleone" }));
  assert.equal(errorOf(taken), "That link is taken.", "sign-up can't take it during the hold");
  assert.ok(!/^[a-z0-9]/.test(`-u${stale.id}`), "the placeholder can't be chosen at sign-up (link names start with a letter or number)");
  await cleanupRecords();
  assert.equal(await handle(stale.id), `-u${stale.id}`, "running again changes nothing");
});
