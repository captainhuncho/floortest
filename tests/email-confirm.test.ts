import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load. No email key: nothing is sent.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-email-confirm-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

async function setup() {
  const { q, USER_COLUMNS } = await import("../src/lib/db");
  const t = Date.now();
  const make = async (handle: string, email: string, verified: boolean) =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES (?, 'h', ?, ?, 'pro', 'UTC', ?, ?) RETURNING id", email, handle, handle, t, verified ? t : null))!.id;
  const load = async (id: number) => (await q.get(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, id))!;
  return { q, make, load };
}

test("an email confirmation link only counts for the person signed in to that account", async () => {
  const { q, make } = await setup();
  const { confirmEmail } = await import("../src/lib/accounts");
  // Someone created an account with the victim's email; the confirmation link reaches the victim.
  const squatter = await make("squat", "victim@x.io", false);
  const other = await make("other", "other@x.io", true);
  const { hashToken } = await import("../src/lib/token-hash");
  await q.run("UPDATE users SET email_verify_token = ? WHERE id = ?", hashToken("tok-verify-1"), squatter);
  assert.equal(await confirmEmail("tok-verify-1", null), undefined, "a click with nobody signed in confirms nothing");
  assert.equal(await confirmEmail("tok-verify-1", other), undefined, "nor does someone signed in to another account");
  assert.equal((await q.get<{ v: number | null }>("SELECT email_verified_at AS v FROM users WHERE id = ?", squatter))!.v, null);
  assert.deepEqual(await confirmEmail("tok-verify-1", squatter), { id: squatter }, "the account's own session confirms it");
});

test("an email change only completes for the person signed in to that account", async () => {
  const { q, make } = await setup();
  const { requestEmailChange, confirmEmailChange } = await import("../src/lib/accounts");
  const me = await make("changer", "changer@x.io", true);
  assert.equal(await requestEmailChange(me, "stranger@x.io", "user"), null);
  // The link as the email carried it (the database holds only its hash).
  const { hashToken } = await import("../src/lib/token-hash");
  const token = "tok-change-1";
  await q.run("UPDATE users SET pending_email_token = ? WHERE id = ?", hashToken(token), me);
  assert.equal(await confirmEmailChange(token, null), null, "the stranger's click alone does nothing");
  assert.equal((await q.get<{ e: string }>("SELECT email AS e FROM users WHERE id = ?", me))!.e, "changer@x.io");
  assert.equal((await confirmEmailChange(token, me))?.to, "stranger@x.io", "the account holder's own click completes it");
});

test("an account with an unconfirmed email can't send as that email", async () => {
  const { make, load } = await setup();
  const { readSubmission } = await import("../src/lib/submission");
  const receiver = await load(await make("recv", "recv@x.io", true));
  const unconfirmed = await load(await make("unconf", "unconf@x.io", false));
  const confirmed = await load(await make("conf", "conf@x.io", true));
  const body = { title: "T", genre: "House", fileName: "t.wav", size: 1000, release_status: "unsigned", mix_status: "mastered", ai_use: "none" };
  const a = await readSubmission(body, receiver as never, unconfirmed as never);
  assert.ok("error" in a && a.status === 403, "refused until the email is confirmed");
  const b = await readSubmission(body, receiver as never, confirmed as never);
  assert.ok(!("error" in b) || b.status !== 403, "a confirmed account is not refused for this reason");
});
