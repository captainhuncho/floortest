import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-identity-approve-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("approving a verification request only works while the person's request is waiting", async () => {
  const { q } = await import("../src/lib/db");
  const { approvePendingIdentity } = await import("../src/lib/identity-approve");
  const t = Date.now();
  const user = async (handle: string, status: string) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, identity_status, created_at) VALUES (?, 'h', ?, ?, 'free', 'UTC', ?, ?, ?) RETURNING id",
      `${handle}@id.io`, handle, handle, t, status, t,
    ))!.id;
  const pending = await user("idpending", "pending");
  const none = await user("idnone", "none");
  const rejected = await user("idrejected", "rejected");
  const status = async (id: number) => (await q.get<{ s: string }>("SELECT identity_status AS s FROM users WHERE id = ?", id))!.s;

  assert.equal(await approvePendingIdentity(none), null, "never asked: refused");
  assert.equal(await status(none), "none");
  assert.equal(await approvePendingIdentity(rejected), null, "rejected and not asked again: refused");
  assert.equal(await status(rejected), "rejected");
  assert.equal(await approvePendingIdentity(999_999), null, "missing: same answer");
  assert.equal(await approvePendingIdentity(0), null);

  const u = await approvePendingIdentity(pending);
  assert.equal(u?.handle, "idpending", "a waiting request is approved");
  assert.equal(await status(pending), "verified");
  assert.equal(await approvePendingIdentity(pending), null, "a second approve does nothing (no second email)");
});

test("the approveIdentity action goes through the pending-only approval", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/app/admin/actions.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function approveIdentity"), src.indexOf("export async function", src.indexOf("export async function approveIdentity") + 10));
  assert.match(fn, /approvePendingIdentity\(userId\)/);
  assert.doesNotMatch(fn, /UPDATE users SET identity_status = 'verified'/, "no unguarded UPDATE left in the action");
});

test("turning down a verification request only works while it's waiting; a verified account keeps its mark and time", async () => {
  const { q } = await import("../src/lib/db");
  const { rejectPendingIdentity } = await import("../src/lib/identity-approve");
  const t = Date.now();
  const user = async (handle: string, status: string, verifiedAt: number | null = null) =>
    (await q.get<{ id: number }>(
      "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, identity_status, identity_verified_at, identity_note, created_at) VALUES (?, 'h', ?, ?, 'free', 'UTC', ?, ?, ?, 'earlier', ?) RETURNING id",
      `${handle}@id.io`, handle, handle, t, status, verifiedAt, t,
    ))!.id;
  const row = (id: number) => q.get<{ identity_status: string; identity_verified_at: number | null; identity_note: string }>("SELECT identity_status, identity_verified_at, identity_note FROM users WHERE id = ?", id);

  const verified = await user("rjverified", "verified", 1234);
  assert.equal(await rejectPendingIdentity(verified, "nope"), null, "a verified account isn't turned down");
  assert.deepEqual(await row(verified), { identity_status: "verified", identity_verified_at: 1234, identity_note: "earlier" });
  for (const status of ["none", "rejected"]) assert.equal(await rejectPendingIdentity(await user(`rj${status}`, status), "nope"), null, `${status}: refused`);
  assert.equal(await rejectPendingIdentity(999_999, "nope"), null, "missing: same answer");

  const waiting = await user("rjpending", "pending");
  const r = await rejectPendingIdentity(waiting, "add a link we can check");
  assert.equal(r?.handle, "rjpending");
  assert.deepEqual(r?.before, { identity_status: "pending", identity_note: "earlier" }, "what Undo puts back");
  assert.deepEqual(await row(waiting), { identity_status: "rejected", identity_verified_at: null, identity_note: "add a link we can check" });
  assert.equal(await rejectPendingIdentity(waiting, "again"), null, "a second click does nothing");
});

test("the rejectIdentity action goes through the pending-only rejection", () => {
  const src = fs.readFileSync(path.join(__dirname, "../src/app/admin/actions.ts"), "utf8");
  const start = src.indexOf("export async function rejectIdentity");
  const fn = src.slice(start, src.indexOf("export async function", start + 10));
  assert.match(fn, /rejectPendingIdentity\(userId, note\)/);
  assert.doesNotMatch(fn, /UPDATE users SET identity_status = 'rejected'/, "no unguarded UPDATE left in the action");
});
