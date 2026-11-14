import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// Sign-up bot protection (Safety audit, 13 Nov; fix 2 and the 100-an-hour cap are the owner's yes, 13 Nov).
process.env.DATA_DIR = testDataDir("ft-signup-guard-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const auth = fs.readFileSync(new URL("../src/app/(auth)/actions.ts", import.meta.url), "utf8");
const body = (name: string) => auth.slice(auth.indexOf(`function ${name}(`)).split("\n}\n")[0];

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

test("fix 1: sign-up fails closed: only a solved bot check goes on freely; an unchecked one goes under the tight caps", async () => {
  const signup = body("signup");
  assert.match(signup, /const bot = await turnstileVerdict\(form\.get\("cf-turnstile-response"\), ip, "auth"\);/);
  assert.match(signup, /if \(bot === "fail"\) return \{ error: BOT_MESSAGE \};/);
  assert.match(signup, /if \(bot === "open" && !\(await uncheckedSignupAllowed\(ip\)\)\) return \{ error: SIGNUP_BUSY \};/);
  assert.ok(signup.indexOf("turnstileVerdict") < signup.indexOf("createAccount("), "checked before any account work");
  const unchecked = body("uncheckedSignupAllowed");
  assert.match(unchecked, /allow\("signup_open_ip", ip, SIGNUP_CAPS\.openIpDay, DAY\)/);
  assert.match(unchecked, /allow\("signup_open_all", "all", SIGNUP_CAPS\.openAllDay, DAY\)/);
  assert.match(unchecked, /recordIncident\(/, "the admins hear about it");
  const { SIGNUP_CAPS } = await import("../src/lib/signup-guard");
  assert.equal(SIGNUP_CAPS.openIpDay, 2);
  assert.equal(SIGNUP_CAPS.openAllDay, 50);
  // The tight cap itself: the third unchecked sign-up from one connection in a day is refused.
  const { allow } = await import("../src/lib/ratelimit");
  const ip = "198.51.100.7";
  assert.equal(await allow("signup_open_ip", ip, SIGNUP_CAPS.openIpDay, DAY), true);
  assert.equal(await allow("signup_open_ip", ip, SIGNUP_CAPS.openIpDay, DAY), true);
  assert.equal(await allow("signup_open_ip", ip, SIGNUP_CAPS.openIpDay, DAY), false);
});

test("fix 2: an unconfirmed account's link shows 'not open yet' and refuses an upload start", async () => {
  const { calloutBlock, NOT_OPEN_YET } = await import("../src/lib/desk");
  const fresh = await account("notyet", false);
  assert.equal(calloutBlock(fresh, undefined, false), "not_open");
  const page = fs.readFileSync(new URL("../src/app/[handle]/page.tsx", import.meta.url), "utf8");
  assert.match(page, /block === "not_open"\s*\?\s*NOT_OPEN_YET\(receiver\.name\)/, "the public page says it");
  const { startUpload, IntakeError } = await import("../src/lib/intake");
  const meta = { name: "Sender", email: "sender@example.test", title: "T", artist: "A", message: "", releaseStatus: "", aiUse: "none", mixStatus: "", genre: "", originalName: "t.mp3" };
  await assert.rejects(startUpload(fresh, meta, 1000, "203.0.113.9"), (e: unknown) => e instanceof IntakeError && e.message === NOT_OPEN_YET("notyet"));
  const { q } = await import("../src/lib/db");
  assert.equal((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM uploads WHERE receiver_id = ?", fresh.id))!.n, 0, "nothing reserved");
  const confirmed = await account("confirmedone", true);
  assert.equal(calloutBlock(confirmed, undefined, false), null, "a confirmed account's link is open");
});

test("fix 2: the nightly clean-up frees link names held by accounts unconfirmed for 7 days, and only those", async () => {
  const { UNCONFIRMED_HANDLE_DAYS, cleanupRecords } = await import("../src/lib/retention");
  assert.equal(UNCONFIRMED_HANDLE_DAYS, 7);
  const old = Date.now() - 8 * DAY;
  const stale = await account("staleone", false, old);
  const recent = await account("recentone", false, Date.now() - 6 * DAY);
  const kept = await account("keptone", true, old);
  await cleanupRecords();
  const { q } = await import("../src/lib/db");
  const handle = async (id: number) => (await q.get<{ handle: string }>("SELECT handle FROM users WHERE id = ?", id))!.handle;
  assert.equal(await handle(stale.id), `-u${stale.id}`, "freed; the account stays with a name nobody can type");
  assert.equal(await handle(recent.id), "recentone", "under 7 days: kept");
  assert.equal(await handle(kept.id), "keptone", "confirmed: kept");
  const { handleHeld } = await import("../src/lib/accounts");
  assert.equal(await handleHeld("staleone"), false, "the old name is free to take straight away");
  assert.ok(!/^[a-z0-9]/.test(`-u${stale.id}`), "the placeholder can't be chosen at sign-up (link names start with a letter or number)");
  await cleanupRecords();
  assert.equal(await handle(stale.id), `-u${stale.id}`, "running again changes nothing");
});

test("fix 3: a throwaway inbox is refused at sign-up with a plain message", async () => {
  const { isThrowawayEmail } = await import("../src/lib/signup-guard");
  assert.equal(isThrowawayEmail("bot@mailinator.com"), true);
  assert.equal(isThrowawayEmail("bot@eu.mailinator.com"), true, "subdomains too");
  assert.equal(isThrowawayEmail("dj@gmail.com"), false);
  assert.equal(isThrowawayEmail("dj@notmailinator.com"), false, "a look-alike domain isn't caught by accident");
  const create = body("createAccount");
  assert.match(create, /if \(!EMAIL\.test\(a\.email\)\) return \{ error: "Enter a valid email\." \};\s*if \(isThrowawayEmail\(a\.email\)\) return \{ error: "Use a permanent email address\." \};/);
});

test("fix 4: the 21st sign-up from one connection in a day is refused, and there is a site-wide hourly cap of 100", async () => {
  const { SIGNUP_CAPS } = await import("../src/lib/signup-guard");
  assert.equal(SIGNUP_CAPS.ipDay, 20);
  assert.equal(SIGNUP_CAPS.allHour, 100);
  const create = body("createAccount");
  assert.match(create, /allow\("signup_ip_day", ip, SIGNUP_CAPS\.ipDay, DAY\)/);
  assert.match(create, /allow\("signup_all", "all", SIGNUP_CAPS\.allHour, HOUR\)/);
  const { allow } = await import("../src/lib/ratelimit");
  const ip = "192.0.2.21";
  for (let i = 1; i <= 20; i++) assert.equal(await allow("signup_ip_day", ip, SIGNUP_CAPS.ipDay, DAY), true, `sign-up ${i}`);
  assert.equal(await allow("signup_ip_day", ip, SIGNUP_CAPS.ipDay, DAY), false, "the 21st is refused");
  const security = fs.readFileSync(new URL("../src/app/admin/security/page.tsx", import.meta.url), "utf8");
  for (const bucket of ["signup_ip_day", "signup_all", "signup_open_ip", "signup_open_all"]) assert.match(security, new RegExp(`\\b${bucket}:`), `${bucket} on Admin → Security`);
});
