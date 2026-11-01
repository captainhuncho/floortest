import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load. No email key: a send
// is only logged.
process.env.DATA_DIR = testDataDir("ft-held-sends-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

// Ops sends with Undo (ops server design §2, owner 1 Nov): the email waits on the server; until it goes, cancel stops it.
test("a held email isn't sent before its time, cancel stops it, and once it has gone cancel can't", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail, deliver, cancelHeldMail, SEND_HOLD_MS } = await import("../src/lib/mail");
  const mail = { userId: null, audience: "support" as const, to: "held@x.io", subject: "Held", body: "Hi" };
  const status = async (id: number) => (await q.get<{ status: string }>("SELECT status FROM outbox WHERE id = ?", id))!.status;

  const held = await queueMail(mail, q, { holdMs: SEND_HOLD_MS });
  await deliver(held);
  assert.equal(await status(held), "queued", "not delivered while held");
  assert.equal(await cancelHeldMail([held]), 1);
  assert.equal(await status(held), "cancelled");

  const goes = await queueMail(mail, q, { holdMs: SEND_HOLD_MS });
  await q.run("UPDATE outbox SET next_at = ? WHERE id = ?", Date.now() - 1, goes); // the hold is over
  await deliver(goes);
  assert.notEqual(await status(goes), "queued", "delivered once the hold is over");
  assert.equal(await cancelHeldMail([goes]), 0, "too late once it has gone");
});

test("Undo at the moment the hold ends: the email goes once or not at all, never both", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail, deliver, cancelHeldMail, SEND_HOLD_MS } = await import("../src/lib/mail");
  for (let i = 0; i < 20; i++) {
    const id = await queueMail({ userId: null, audience: "support", to: `race${i}@x.io`, subject: "Race", body: "Hi" }, q, { holdMs: SEND_HOLD_MS });
    await q.run("UPDATE outbox SET next_at = ? WHERE id = ?", Date.now() - 1, id); // the hold ends now
    const [status, cancelled] = await Promise.all([deliver(id), cancelHeldMail([id])]);
    const row = (await q.get<{ status: string; attempts: number }>("SELECT status, attempts FROM outbox WHERE id = ?", id))!;
    if (cancelled) {
      assert.equal(row.status, "cancelled");
      assert.equal(row.attempts, 0, "never tried once cancelled");
      assert.equal(status, "cancelled");
    } else {
      assert.notEqual(row.status, "cancelled");
      assert.equal(row.attempts, 1, "tried exactly once");
    }
  }
});

test("a held email whose server stopped mid-hold is sent by the mail job, once", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail, drainOutbox, cancelHeldMail, SEND_HOLD_MS } = await import("../src/lib/mail");
  // Queued with a hold and no process left to send it (the timer died with the server).
  const id = await queueMail({ userId: null, audience: "support", to: "restart@x.io", subject: "Restart", body: "Hi" }, q, { holdMs: SEND_HOLD_MS });
  await drainOutbox();
  assert.equal((await q.get<{ status: string }>("SELECT status FROM outbox WHERE id = ?", id))!.status, "queued", "the job waits out the hold");
  await q.run("UPDATE outbox SET next_at = ? WHERE id = ?", Date.now() - 1, id);
  await drainOutbox();
  await drainOutbox();
  const row = (await q.get<{ status: string; attempts: number }>("SELECT status, attempts FROM outbox WHERE id = ?", id))!;
  assert.notEqual(row.status, "queued");
  assert.equal(row.attempts, 1);
  assert.equal(await cancelHeldMail([id]), 0, "too late once the job sent it");
});

test("an undo token works only for the same admin, within the hold, untampered", async () => {
  const { signUndo, readUndo } = await import("../src/lib/ops-undo");
  const { SEND_HOLD_MS } = await import("../src/lib/mail");
  const at = Date.now();
  const undo = { kind: "waitlist_invite" as const, items: [{ ref: 7, code: "FLOOR-AAAA" }, { ref: 8, code: "FLOOR-BBBB" }], mail: [11, 12], admin: 42 };
  const token = signUndo(undo, at);
  assert.deepEqual(readUndo(token, 42, at + 1_000), { ...undo, exp: at + SEND_HOLD_MS });
  assert.equal(readUndo(token, 43, at + 1_000), null, "another admin");
  assert.equal(readUndo(token, 42, at + SEND_HOLD_MS + 1), null, "past the hold");
  const [body, mac] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...undo, mail: [99], exp: at + SEND_HOLD_MS })).toString("base64url");
  assert.equal(readUndo(`${forged}.${mac}`, 42, at + 1_000), null, "changed contents");
  assert.equal(readUndo(`${body}.x${mac.slice(1)}`, 42, at + 1_000), null, "changed signature");
  assert.equal(readUndo("nonsense", 42, at), null);
});

test("an email queued again after a failed try can't be cancelled: it may have reached them", async () => {
  const { q } = await import("../src/lib/db");
  const { queueMail, cancelHeldMail, SEND_HOLD_MS } = await import("../src/lib/mail");
  const id = await queueMail({ userId: null, audience: "support", to: "retry@x.io", subject: "Retry", body: "Hi" }, q, { holdMs: SEND_HOLD_MS });
  // What deliver leaves after a timed-out first try (retry backoff) or the daily cap: queued again, one attempt made.
  await q.run("UPDATE outbox SET attempts = 1 WHERE id = ?", id);
  assert.equal(await cancelHeldMail([id]), 0);
  assert.equal((await q.get<{ status: string }>("SELECT status FROM outbox WHERE id = ?", id))!.status, "queued");
});

test("Undo stops a waitlist invite and puts the person back, or, if putting back fails, does neither", async () => {
  const { q, now } = await import("../src/lib/db");
  const { queueMail, SEND_HOLD_MS } = await import("../src/lib/mail");
  const { takeBack } = await import("../src/lib/ops-undo");
  const setUp = async (n: number) => {
    const email = `wait${n}@x.io`;
    const w = (await q.get<{ id: number }>("INSERT INTO waitlist (email, created_at, invited_at) VALUES (?, ?, ?) RETURNING id", email, now(), now()))!;
    const code = `FLOOR-TEST${n}`;
    await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) VALUES (?,?,?,?,?)", code, 1, "From the waitlist", email, now());
    const mail = await queueMail({ userId: null, audience: "support", to: email, subject: "Invite", body: "Hi" }, q, { holdMs: SEND_HOLD_MS });
    return { id: w.id, code, mail, u: { kind: "waitlist_invite" as const, items: [{ ref: w.id, code }], mail: [mail], admin: 1, exp: Date.now() + SEND_HOLD_MS } };
  };
  const state = async (s: { id: number; code: string; mail: number }) => ({
    mail: (await q.get<{ status: string }>("SELECT status FROM outbox WHERE id = ?", s.mail))!.status,
    invited: (await q.get<{ invited_at: number | null }>("SELECT invited_at FROM waitlist WHERE id = ?", s.id))!.invited_at !== null,
    revoked: (await q.get<{ revoked_at: number | null }>("SELECT revoked_at FROM invites WHERE code = ?", s.code))!.revoked_at !== null,
  });

  const good = await setUp(1);
  assert.equal(await takeBack(good.u), 1);
  assert.deepEqual(await state(good), { mail: "cancelled", invited: false, revoked: true });

  const bad = await setUp(2);
  await assert.rejects(
    takeBack(bad.u, async () => {
      throw new Error("revert failed");
    }),
  );
  assert.deepEqual(await state(bad), { mail: "queued", invited: true, revoked: false }, "the email still goes, the invite stands");
});
