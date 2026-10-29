import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-two-factor-on-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("turning two-factor on ends every other way in: other browsers, the app, ops sessions and unused reset links", async () => {
  const { q } = await import("../src/lib/db");
  const { env } = await import("../src/lib/env");
  const { hashToken } = await import("../src/lib/token-hash");
  const { newTotpSecret, sealSecret, totpCode } = await import("../src/lib/totp");
  const { turnOnTwoFactor } = await import("../src/lib/two-factor");
  const t = Date.now();
  const me = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('tfon@x.io', 'h', 'Me', 'tfon', 'pro', 'UTC', ?, ?) RETURNING id",
    t, t,
  ))!.id;
  const secret = newTotpSecret();
  await q.run("UPDATE users SET totp_secret = ? WHERE id = ?", sealSecret(secret, env.secret), me);
  const keep = hashToken("this-browser");
  for (const [tok, kind] of [["this-browser", "web"], ["other-browser", "web"], ["phone-app", "app"]] as const)
    await q.run("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, kind) VALUES (?,?,?,?,?)", hashToken(tok), me, t + 86_400_000, t, kind);
  await q.run("INSERT INTO admin_sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?,?,?,?,?)", hashToken("ops"), me, t, t, t + 3_600_000);
  await q.run("INSERT INTO password_resets (token_hash, user_id, expires_at, created_at) VALUES (?,?,?,?)", hashToken("reset"), me, t + 3_600_000, t);

  const on = await turnOnTwoFactor(me, totpCode(secret, Math.floor(t / 30_000)), { keep });
  assert.ok("codes" in on, "two-factor is on");
  const left = await q.all<{ token_hash: string }>("SELECT token_hash FROM sessions WHERE user_id = ?", me);
  assert.deepEqual(left.map((r) => r.token_hash), [keep], "only the browser that turned it on stays signed in");
  assert.equal(Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM admin_sessions WHERE user_id = ?", me))!.n), 0, "ops sessions end");
  assert.ok((await q.get<{ used_at: number | null }>("SELECT used_at FROM password_resets WHERE user_id = ?", me))!.used_at, "unused reset links stop working");
});

test("confirmTwoFactor passes the current session to turnOnTwoFactor and doesn't delete sessions itself", () => {
  const src = fs.readFileSync(new URL("../src/app/dashboard/actions/security.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function confirmTwoFactor"), src.indexOf("export async function disableTwoFactor"));
  assert.match(body, /turnOnTwoFactor\(u\.id, code, \{ keep: await currentSessionHash\(\) \}\)/);
  assert.doesNotMatch(body, /DELETE FROM sessions/);
});
