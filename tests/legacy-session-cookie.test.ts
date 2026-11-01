import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextRequest } from "next/server";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-legacy-cookie-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

/**
 * On the live site the session cookie is `__Host-floortest_session`, which no sibling subdomain can set. The plain
 * `floortest_session` name (the live name before 15 Oct 2026) can be planted from any `*.floortest.app` host, so the
 * live site must never read it, even when it carries a real, live session token.
 */
async function liveSessionToken(handle: string) {
  const { q } = await import("../src/lib/db");
  const { hashToken } = await import("../src/lib/token-hash");
  const t = Date.now();
  const id = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'pro', 'UTC', ?, ?) RETURNING id",
    `${handle}@x.io`, handle, handle, t, t,
  ))!.id;
  const token = handle.padEnd(64, "0");
  await q.run("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, device, last_seen_at) VALUES (?,?,?,?,?,?)", hashToken(token), id, t + 86_400_000, t, "test", t);
  const live = await q.get("SELECT 1 AS ok FROM sessions WHERE token_hash = ? AND expires_at > ?", hashToken(token), t);
  assert.ok(live, "the token is a real, live session");
  return token;
}

const request = (cookie: string) => new NextRequest("https://floortest.app/dashboard", { headers: { cookie } });

test("on the live site a request carrying only the old plain session cookie is signed out", async () => {
  const token = await liveSessionToken("legacyonly");
  const { readSessionToken } = await import("../src/lib/sessions");
  assert.equal(readSessionToken(request(`floortest_session=${token}`).cookies, true), undefined, "the old name is never read on the live site");
});

test("on the live site the __Host- session cookie still signs you in", async () => {
  const token = await liveSessionToken("hostcookie");
  const { readSessionToken } = await import("../src/lib/sessions");
  assert.equal(readSessionToken(request(`__Host-floortest_session=${token}`).cookies, true), token);
  assert.equal(readSessionToken(request(`floortest_session=planted; __Host-floortest_session=${token}`).cookies, true), token, "a planted old cookie never wins");
});

test("locally the plain name is the current name and still works", async () => {
  const { readSessionToken } = await import("../src/lib/sessions");
  assert.equal(readSessionToken(request("floortest_session=local").cookies, false), "local");
});
