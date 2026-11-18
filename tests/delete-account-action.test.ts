import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";
import { inRequest, form } from "./request-scope";

// Delete account (owner, 18 Nov): DELETE FLOORTEST typed exactly, no password, and the two-step code when it's on.
// Runs the real deleteAccount action against a throwaway database.
process.env.DATA_DIR = testDataDir("ft-delete-account-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.VERCEL_ENV;

let n = 0;
async function signedIn(twoStepSecret: string | null) {
  const { q, now } = await import("../src/lib/db");
  const { sealSecret } = await import("../src/lib/totp");
  const { createSession } = await import("../src/lib/auth");
  n++;
  const id = Number((await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at, email_verified_at, totp_secret, totp_enabled_at) VALUES (?, 'h', ?, ?, 'free', 'dj', 'UTC', ?, ?, ?, ?) RETURNING id",
    `delact${n}@example.test`, `Del ${n}`, `delact${n}`, now(), now(),
    twoStepSecret ? sealSecret(twoStepSecret, process.env.APP_SECRET!) : null, twoStepSecret ? now() : null,
  ))!.id);
  const jar = new Map<string, string>();
  await inRequest(jar, "203.0.113.40", () => createSession(id));
  const requested = async () => (await q.get<{ t: number | null }>("SELECT deletion_requested_at AS t FROM users WHERE id = ?", id))!.t;
  return { id, jar, requested };
}

async function del(jar: Map<string, string>, fields: Record<string, string>) {
  const { deleteAccount } = await import("../src/app/dashboard/actions/settings");
  return inRequest(jar, "203.0.113.40", () => deleteAccount(undefined, form(fields)), { dropAfter: true });
}

test("a wrong or lowercase phrase is refused and nothing is deleted", async () => {
  const a = await signedIn(null);
  for (const confirm of ["", "delete floortest", "DELETE", "DELETE FLOORTEST!"]) {
    const out = await del(a.jar, { confirm });
    assert.deepEqual(out.answer, { error: "Type DELETE FLOORTEST to confirm. Nothing has been deleted." }, `refused: "${confirm}"`);
  }
  assert.equal(await a.requested(), null, "account untouched");
});

test("without two-step, the right phrase alone deletes: no password asked", async () => {
  const a = await signedIn(null);
  const out = await del(a.jar, { confirm: "  DELETE FLOORTEST " });
  assert.equal(out.redirect, "/?deleted=pending");
  assert.ok(await a.requested(), "deletion started");
});

test("with two-step on, the right phrase without a good code is refused; with the code it deletes", async () => {
  const { newTotpSecret, totpCode, currentStep } = await import("../src/lib/totp");
  const secret = newTotpSecret();
  const a = await signedIn(secret);
  for (const code of [undefined, "", "abcdef"]) {
    const out = await del(a.jar, code === undefined ? { confirm: "DELETE FLOORTEST" } : { confirm: "DELETE FLOORTEST", code });
    assert.deepEqual(out.answer, { error: "That two-step code didn't work." }, `refused with code ${JSON.stringify(code)}`);
  }
  assert.equal(await a.requested(), null, "still not deleted");
  const out = await del(a.jar, { confirm: "DELETE FLOORTEST", code: totpCode(secret, currentStep()) });
  assert.equal(out.redirect, "/?deleted=pending");
  assert.ok(await a.requested(), "deletion started");
});
