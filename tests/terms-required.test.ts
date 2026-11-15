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
