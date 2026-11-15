import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { testDataDir } from "./test-db";
import { inRequest } from "./request-scope";

// Nobody gets in without agreeing to the Terms (owner, 15 Nov): the desk, its API and the app all wait for the tick,
// and Terms that can't be read count as not agreed.
process.env.DATA_DIR = testDataDir("ft-terms-required-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.VERCEL_ENV;

let n = 0;
async function user() {
  const { q, now } = await import("../src/lib/db");
  n++;
  const email = `req${n}@example.test`;
  const id = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'free', 'dj', 'UTC', ?, ?) RETURNING id",
    email,
    `Req ${n}`,
    `requser${n}`,
    now(),
    now(),
  ))!.id;
  return { id: Number(id), email };
}

const appCall = async (route: string, token: string, init: RequestInit = {}) =>
  new Request(`http://localhost${route}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) } });

test("the app refuses every desk route until the current Terms are ticked, then opens", async () => {
  const { issueAppSession } = await import("../src/lib/app-auth");
  const me = await import("../src/app/api/v1/me/route");
  const terms = await import("../src/app/api/v1/terms/route");
  const u = await user();
  const { accessToken } = await issueAppSession(u.id, "test");

  const refused = (await inRequest(new Map(), "203.0.113.40", async () => me.GET(await appCall("/api/v1/me", accessToken)))).answer as Response;
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).termsNeeded, true);

  const state = (await inRequest(new Map(), "203.0.113.40", async () => terms.GET(await appCall("/api/v1/terms", accessToken)))).answer as Response;
  const s = await state.json();
  assert.equal(s.needed, true);
  assert.match(s.url, /\/terms$/);

  const noTick = (await inRequest(new Map(), "203.0.113.40", async () => terms.POST(await appCall("/api/v1/terms", accessToken, { method: "POST", body: JSON.stringify({ hash: s.hash }) })))).answer as Response;
  assert.equal(noTick.status, 400, "no tick, no agreement");
  const wrong = (await inRequest(new Map(), "203.0.113.40", async () => terms.POST(await appCall("/api/v1/terms", accessToken, { method: "POST", body: JSON.stringify({ tick: true, hash: "0".repeat(64) }) })))).answer as Response;
  assert.equal(wrong.status, 409, "a tick for other text");
  const ok = (await inRequest(new Map(), "203.0.113.40", async () => terms.POST(await appCall("/api/v1/terms", accessToken, { method: "POST", body: JSON.stringify({ tick: true, hash: s.hash }) })))).answer as Response;
  assert.equal(ok.status, 200);

  const open = (await inRequest(new Map(), "203.0.113.40", async () => me.GET(await appCall("/api/v1/me", accessToken)))).answer as Response;
  assert.equal(open.status, 200);
});

test("Terms that can't be read keep everyone out, even people who ticked before", async () => {
  const { currentTerms, deskNeedsTerms, forgetTerms, recordAcceptance, termsSource } = await import("../src/lib/terms-record");
  const u = await user();
  await recordAcceptance({ userId: u.id, email: u.email }, "Req", await currentTerms());
  assert.equal(await deskNeedsTerms(false, u.id), false, "ticked: in");
  const read = termsSource.read;
  const quiet = console.error;
  console.error = () => {};
  try {
    forgetTerms();
    termsSource.read = async () => {
      throw new Error("Terms page unreadable");
    };
    assert.equal(await deskNeedsTerms(false, u.id), true, "can't be read: out");
    assert.equal(await deskNeedsTerms(true, u.id), false, "an admin's read-only view is never asked");
  } finally {
    termsSource.read = read;
    console.error = quiet;
    forgetTerms();
  }
});

test("every desk door checks the Terms: pages, actions, API changes and reads, and every app route", () => {
  const auth = fs.readFileSync("src/lib/auth.ts", "utf8");
  assert.match(auth, /const termsNeeded = await deskNeedsTerms\(false, person\.id\);/);
  assert.match(auth, /return d && !d\.termsNeeded \? d\.user : null;/, "currentUser: no desk without the tick");
  assert.match(auth, /if \(d\.termsNeeded\) redirect\("\/accept-terms"\);/, "requireUser and requireRole");
  assert.match(auth, /if \(d\.termsNeeded\) return Response\.json\(\{ error: TERMS_NEEDED_ERROR, termsNeeded: true \}, \{ status: 403 \}\);/, "currentDeskForChange");
  // Every app route but sign-in, sign-out, refresh and the Terms themselves goes through appUserAgreed.
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : e.name === "route.ts" ? [path.join(dir, e.name)] : []));
  for (const f of walk("src/app/api/v1")) {
    if (/\/auth\/|\/terms\//.test(f)) continue;
    const src = fs.readFileSync(f, "utf8");
    assert.ok(!/\bappUser\(/.test(src), `${f} uses appUser without the Terms check`);
    assert.match(src, /appUserAgreed\(req\)/, `${f} checks the Terms`);
  }
});

test("someone who hasn't ticked can still delete their account and ask for their data, but not use the desk", async () => {
  const { createSession, currentPerson, requireOwnAccount, requireUser } = await import("../src/lib/auth");
  const u = await user();
  const jar = new Map<string, string>();
  await inRequest(jar, "203.0.113.41", () => createSession(u.id));
  const desk = await inRequest(jar, "203.0.113.41", () => requireUser(), { dropAfter: true });
  assert.equal(desk.redirect, "/accept-terms", "no desk without the tick");
  const own = await inRequest(jar, "203.0.113.41", () => requireOwnAccount(), { dropAfter: true });
  assert.equal((own.answer as { id: number }).id, u.id, "Delete account still works");
  const person = await inRequest(jar, "203.0.113.41", () => currentPerson(), { dropAfter: true });
  assert.equal((person.answer as { id: number }).id, u.id, "the data request form still knows who asks");

  const settings = fs.readFileSync("src/app/dashboard/actions/settings.ts", "utf8");
  assert.match(settings.slice(settings.indexOf("export async function deleteAccount")), /^[^]*?requireOwnAccount\(\)/);
  assert.match(fs.readFileSync("src/app/contact/actions.ts", "utf8"), /currentPerson\(\)/, "data requests go through the contact form");
  const page = fs.readFileSync("src/app/(auth)/accept-terms/page.tsx", "utf8");
  assert.match(page, /<Link href="\/contact\?topic=data"/);
  assert.match(page, /<DeleteAccount /);
  assert.equal((page.match(/<Leave /g) ?? []).length, 2, "both on the Terms page and when the Terms can't be read");
});

test("admins tick on their own desk like everyone, but the ops console never waits for the Terms", async () => {
  const { deskNeedsTerms } = await import("../src/lib/terms-record");
  const u = await user();
  assert.equal(await deskNeedsTerms(false, u.id), true, "an admin's own desk is a desk like any other");
  for (const f of ["src/lib/admin.ts", "src/lib/ops.ts", "src/lib/ops-access.ts"]) {
    const src = fs.readFileSync(f, "utf8");
    assert.doesNotMatch(src, /deskNeedsTerms|termsNeeded|requireUser|currentDesk/, `${f} stays reachable when the Terms can't be read`);
  }
  assert.match(fs.readFileSync("src/lib/admin.ts", "utf8"), /const u = await currentOpsAdmin\(\);/);
});

test("behaviour: changes answer 403 before the tick; a teammate ticks for themselves; the Terms page never loops", async () => {
  const { q, now } = await import("../src/lib/db");
  const { createSession, currentDeskForChange, requireUser, DESK_COOKIE } = await import("../src/lib/auth");
  const { currentTerms, recordAcceptance } = await import("../src/lib/terms-record");
  const page = await import("../src/app/(auth)/accept-terms/page");
  const owner = await user();
  const mate = await user();
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('teams', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", now());
  await q.run("UPDATE users SET plan = 'pro' WHERE id = ?", owner.id);
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", owner.id, mate.id, now());
  await recordAcceptance({ userId: owner.id, email: owner.email }, "Owner", await currentTerms());

  const jar = new Map<string, string>();
  await inRequest(jar, "203.0.113.42", () => createSession(mate.id));
  const change = (await inRequest(jar, "203.0.113.42", () => currentDeskForChange(), { dropAfter: true })).answer as Response;
  assert.equal(change.status, 403);
  assert.equal((await change.json()).termsNeeded, true);
  const open = await inRequest(jar, "203.0.113.42", () => page.default(), { dropAfter: true });
  assert.equal(open.redirect, undefined, "the Terms page shows, it doesn't send them round again");

  jar.set(DESK_COOKIE, String(owner.id));
  const onTeam = await inRequest(jar, "203.0.113.42", () => requireUser(), { dropAfter: true });
  assert.equal(onTeam.redirect, "/accept-terms", "the owner ticked, the teammate didn't: no team desk for them");

  await recordAcceptance({ userId: mate.id, email: mate.email }, "Mate", await currentTerms());
  const team = await inRequest(jar, "203.0.113.42", () => requireUser(), { dropAfter: true });
  assert.equal((team.answer as { id: number }).id, owner.id, "after their own tick they work the team desk");
  const back = await inRequest(jar, "203.0.113.42", () => page.default(), { dropAfter: true });
  assert.equal(back.redirect, "/dashboard/floor", "ticked: the Terms page sends them to the desk, once");
});

test("behaviour: /api/v1/terms limits tries, refuses when the Terms can't be read, and a repeated tick emails once", async () => {
  const { q } = await import("../src/lib/db");
  const { issueAppSession } = await import("../src/lib/app-auth");
  const { forgetTerms, termsSource } = await import("../src/lib/terms-record");
  const terms = await import("../src/app/api/v1/terms/route");
  const u = await user();
  const { accessToken } = await issueAppSession(u.id, "test");
  const ip = "203.0.113.43";
  const post = async (b: unknown) =>
    (await inRequest(new Map(), ip, async () => terms.POST(await appCall("/api/v1/terms", accessToken, { method: "POST", body: JSON.stringify(b) })))).answer as Response;
  const { hash } = await ((await inRequest(new Map(), ip, async () => terms.GET(await appCall("/api/v1/terms", accessToken)))).answer as Response).json();

  assert.equal((await post({ tick: true, hash })).status, 200);
  assert.equal((await post({ tick: true, hash })).status, 200, "a repeated tick is fine");
  const rows = await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM terms_acceptances WHERE user_id = ?", u.id);
  assert.equal(Number(rows!.n), 1, "one acceptance");
  const mails = await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM outbox WHERE to_email = ?", u.email);
  assert.ok(Number(mails!.n) <= 1, "at most one stamped copy");

  const read = termsSource.read;
  const quiet = console.error;
  console.error = () => {};
  try {
    forgetTerms();
    termsSource.read = async () => {
      throw new Error("Terms page unreadable");
    };
    assert.equal((await post({ tick: true, hash })).status, 503, "can't be read: no tick stored");
    const get = (await inRequest(new Map(), ip, async () => terms.GET(await appCall("/api/v1/terms", accessToken)))).answer as Response;
    assert.equal(get.status, 503);
  } finally {
    termsSource.read = read;
    console.error = quiet;
    forgetTerms();
  }

  let last = 0;
  for (let i = 0; i < 31; i++) last = (await post({ tick: true, hash })).status;
  assert.equal(last, 429, "30 tries an hour");
});

test("behaviour: a failed archive write doesn't lock out people who ticked", async () => {
  const { currentTerms, deskNeedsTerms, forgetTerms, recordAcceptance } = await import("../src/lib/terms-record");
  const u = await user();
  await recordAcceptance({ userId: u.id, email: u.email }, "Req", await currentTerms());
  const src = fs.readFileSync("src/lib/terms-record.ts", "utf8");
  assert.match(src, /catch \(e\) \{\n\s+console\.error\("\[terms\] couldn't archive this Terms text; will retry", e\);/);
  forgetTerms();
  assert.equal(await deskNeedsTerms(false, u.id), false, "ticked: in, after a fresh read");
});
