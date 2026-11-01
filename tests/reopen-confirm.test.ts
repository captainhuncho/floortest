import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load. No email provider:
// emails are only written to the outbox.
process.env.DATA_DIR = testDataDir("ft-reopen-confirm-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("a typed address only gets a confirmation; the alert is armed once its single-use link is opened", async () => {
  const { q } = await import("../src/lib/db");
  const { requestReopenAlert, confirmReopenAlert, sendReopenAlerts } = await import("../src/lib/reopen");
  const t = Date.now();
  const uid = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('desk@x.io','h','Desk','deskone','pro','UTC',?) RETURNING id",
    t,
  ))!.id;
  const c = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Open', ?) RETURNING id", uid, t))!.id;
  await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", c, uid);
  const mails = () => q.all<{ subject: string; body: string }>("SELECT subject, body FROM outbox WHERE lower(to_email) = 'fan@x.io' ORDER BY id");

  const token = await requestReopenAlert(uid, "fan@x.io");
  assert.ok(token, "a confirmation link was made");
  const first = await mails();
  assert.equal(first.length, 1);
  assert.match(first[0].subject, /confirm/i, "the first email only asks to confirm");
  assert.ok(!first[0].body.includes(token!), "the stored copy hides the link");
  const row = (await q.get<{ confirm_hash: string | null; confirmed_at: number | null }>("SELECT confirm_hash, confirmed_at FROM reopen_alerts WHERE user_id = ?", uid))!;
  assert.ok(row.confirm_hash && row.confirm_hash !== token, "only a hash of the link is stored");
  assert.equal(row.confirmed_at, null);

  // The link is open, but nothing goes to an address that hasn't confirmed.
  assert.equal(await sendReopenAlerts(uid), 0);
  assert.equal((await mails()).length, 1);

  assert.equal(await confirmReopenAlert("not-the-token"), false);
  assert.equal(await confirmReopenAlert(token!), true);
  assert.equal(await confirmReopenAlert(token!), false, "single use");
  assert.equal(await sendReopenAlerts(uid), 1, "armed: the reopen email goes");
  assert.equal(await sendReopenAlerts(uid), 0, "used up: reopening again later sends nothing more");
});

test("an expired confirmation link arms nothing", async () => {
  const { q } = await import("../src/lib/db");
  const { requestReopenAlert, confirmReopenAlert } = await import("../src/lib/reopen");
  const t = Date.now();
  const uid = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('desk2@x.io','h','Desk','desktwo','pro','UTC',?) RETURNING id",
    t,
  ))!.id;
  const token = (await requestReopenAlert(uid, "late@x.io"))!;
  await q.run("UPDATE reopen_alerts SET confirm_expires_at = ? WHERE user_id = ?", t - 1, uid);
  assert.equal(await confirmReopenAlert(token), false);
  assert.equal(await q.count("SELECT COUNT(*)::int AS n FROM reopen_alerts WHERE user_id = ? AND confirmed_at IS NOT NULL", uid), 0);
});
