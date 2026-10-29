import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-invite-restore-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const t = Date.now();
const invite = async (code: string, email: string | null, revoked = true) => {
  const { q } = await import("../src/lib/db");
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at, revoked_at) VALUES (?, 1, '', ?, ?, ?)", code, email, t, revoked ? t : null);
};
const mail = async (to: string, body: string) => {
  const { q } = await import("../src/lib/db");
  await q.run("INSERT INTO outbox (to_email, subject, body, status, audience, created_at) VALUES (?, 'You''re invited to the FloorTest beta', ?, 'sent', 'support', ?)", to, body, t);
};
const revokedAt = async (code: string) => {
  const { q } = await import("../src/lib/db");
  return (await q.get<{ revoked_at: number | null }>("SELECT revoked_at FROM invites WHERE code = ?", code))?.revoked_at;
};

test("restore puts a revoked invite back, personal or shared", async () => {
  const { restoreRevokedInvite } = await import("../src/lib/invites");
  await invite("FLOOR-RESTOREME01", "ana@x.io");
  await invite("CREW", null);
  assert.deepEqual(await restoreRevokedInvite("floor-restoreme01"), { ok: true, code: "FLOOR-RESTOREME01", email: "ana@x.io", emails: 0 });
  assert.equal(await revokedAt("FLOOR-RESTOREME01"), null);
  assert.equal((await restoreRevokedInvite("CREW")).ok, true, "shared codes come back freely");
  assert.equal((await restoreRevokedInvite("CREW")).ok, false, "a live invite isn't in the Revoked list");
});

test("restore is refused when the email has an account or another live invite", async () => {
  const { q } = await import("../src/lib/db");
  const { restoreRevokedInvite } = await import("../src/lib/invites");
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('Bo@X.io', 'h', 'B', 'bo', 'free', 'UTC', ?)", t);
  await invite("FLOOR-BOBOBOBOBO", "bo@x.io");
  const r = await restoreRevokedInvite("FLOOR-BOBOBOBOBO");
  assert.equal(r.ok, false);
  assert.match(!r.ok ? r.reason : "", /already has an account/);
  assert.ok(await revokedAt("FLOOR-BOBOBOBOBO"), "still revoked");

  await invite("FLOOR-CYOLDOLDOL", "cy@x.io");
  await invite("FLOOR-CYNEWNEWNE", "cy@x.io", false);
  const c = await restoreRevokedInvite("FLOOR-CYOLDOLDOL");
  assert.equal(c.ok, false);
  assert.match(!c.ok ? c.reason : "", /another invite waiting/);
  assert.ok(await revokedAt("FLOOR-CYOLDOLDOL"), "still revoked");
});

test("delete removes a revoked invite and the invite emails carrying its code, nothing else", async () => {
  const { q } = await import("../src/lib/db");
  const { deleteRevokedInvite } = await import("../src/lib/invites");
  await invite("FLOOR-DEEDEEDEE1", "dee@x.io");
  await mail("Dee@X.io", "Claim your link: https://floortest.test/signup?invite=FLOOR-DEEDEEDEE1\n\nYour invite code is FLOOR-DEEDEEDEE1.");
  await mail("dee@x.io", "Your sign-in code is: •••••• (hidden)");
  await mail("other@x.io", "Your invite code is FLOOR-DEEDEEDEE1.");
  await q.run("INSERT INTO admin_log (action, target, detail, created_at) VALUES ('invited by email', 'dee@x.io', 'FLOOR-DEEDEEDEE1', ?)", t);

  assert.deepEqual(await deleteRevokedInvite("FLOOR-DEEDEEDEE1"), { ok: true, code: "FLOOR-DEEDEEDEE1", email: "dee@x.io", emails: 1 });
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM invites WHERE code = 'FLOOR-DEEDEEDEE1'"), 0);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM outbox WHERE strpos(body, 'FLOOR-DEEDEEDEE1') > 0 AND lower(to_email) = 'dee@x.io'"), 0);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM outbox WHERE lower(to_email) = 'dee@x.io'"), 1, "her other emails stay");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM outbox WHERE to_email = 'other@x.io'"), 1, "someone else's email stays");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM admin_log WHERE detail = 'FLOOR-DEEDEEDEE1'"), 1, "log lines stay");
});

test("delete is refused for a used or a live invite", async () => {
  const { q } = await import("../src/lib/db");
  const { deleteRevokedInvite } = await import("../src/lib/invites");
  await invite("FLOOR-USEDUSEDUS", "eve@x.io");
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, tz, invite_code, created_at) VALUES ('eve@x.io', 'h', 'E', 'eve', 'free', 'UTC', 'FLOOR-USEDUSEDUS', ?)", t);
  const used = await deleteRevokedInvite("FLOOR-USEDUSEDUS");
  assert.equal(used.ok, false);
  assert.match(!used.ok ? used.reason : "", /signed up with it/);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM invites WHERE code = 'FLOOR-USEDUSEDUS'"), 1);

  await invite("FLOOR-LIVELIVELI", "fay@x.io", false);
  await mail("fay@x.io", "Your invite code is FLOOR-LIVELIVELI.");
  assert.equal((await deleteRevokedInvite("FLOOR-LIVELIVELI")).ok, false, "not revoked");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM invites WHERE code = 'FLOOR-LIVELIVELI'"), 1);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM outbox WHERE to_email = 'fay@x.io'"), 1);
});

test("injection-shaped codes do nothing", async () => {
  const { q } = await import("../src/lib/db");
  const { deleteRevokedInvite, restoreRevokedInvite } = await import("../src/lib/invites");
  const invites = await q.count("SELECT COUNT(*) AS n FROM invites");
  const mails = await q.count("SELECT COUNT(*) AS n FROM outbox");
  const revoked = await q.count("SELECT COUNT(*) AS n FROM invites WHERE revoked_at IS NOT NULL");
  for (const bad of ["' OR 1=1 --", "x'; DELETE FROM invites; --", "%", "", null]) {
    assert.equal((await restoreRevokedInvite(bad)).ok, false);
    assert.equal((await deleteRevokedInvite(bad)).ok, false);
  }
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM invites"), invites);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM outbox"), mails);
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM invites WHERE revoked_at IS NOT NULL"), revoked);
});
