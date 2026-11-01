import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-ops-sessions-end-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("confirming an email change also ends the person's ops (admin area) sessions", async () => {
  const { q } = await import("../src/lib/db");
  const { hashToken } = await import("../src/lib/token-hash");
  const { confirmEmailChange } = await import("../src/lib/accounts");
  const t = Date.now();
  const me = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at, pending_email, pending_email_token, pending_email_at) VALUES ('old@x.io', 'h', 'Me', 'me', 'pro', 'UTC', ?, ?, 'new@x.io', ?, ?) RETURNING id",
    t, t, hashToken("change-token"), t,
  ))!.id;
  await q.run("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, kind) VALUES (?,?,?,?,'web')", hashToken("web"), me, t + 86_400_000, t);
  await q.run("INSERT INTO admin_sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?)", hashToken("ops"), me, t, t, t + 3_600_000);
  assert.ok(await confirmEmailChange("change-token", me));
  const n = async (table: string) => Number((await q.get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE user_id = ?`, me))!.n);
  assert.equal(await n("sessions"), 0);
  assert.equal(await n("admin_sessions"), 0, "the ops session ends too");
});

test("sign out other devices ends ops sessions as well: it goes through revokeAllSessions", () => {
  const src = fs.readFileSync(new URL("../src/app/dashboard/actions/security.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function signOutOtherDevices"), src.indexOf("export async function startTwoFactor"));
  assert.match(body, /revokeAllSessions\(u\.id, \{ keep/);
  assert.doesNotMatch(body, /DELETE FROM sessions/);
});
