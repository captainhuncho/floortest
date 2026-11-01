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

test("an undo token works only for the same admin, within the hold, untampered", async () => {
  const { signUndo, readUndo } = await import("../src/lib/ops-undo");
  const { SEND_HOLD_MS } = await import("../src/lib/mail");
  const at = Date.now();
  const token = signUndo({ kind: "plan_approve", ref: 7, user: 3, prev: "free", mail: [11], admin: 42 }, at);
  assert.deepEqual(readUndo(token, 42, at + 1_000), { kind: "plan_approve", ref: 7, user: 3, prev: "free", mail: [11], admin: 42, exp: at + SEND_HOLD_MS });
  assert.equal(readUndo(token, 43, at + 1_000), null, "another admin");
  assert.equal(readUndo(token, 42, at + SEND_HOLD_MS + 1), null, "past the hold");
  const [body, mac] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ kind: "plan_approve", ref: 7, user: 3, prev: "pro", mail: [11], admin: 42, exp: at + SEND_HOLD_MS })).toString("base64url");
  assert.equal(readUndo(`${forged}.${mac}`, 42, at + 1_000), null, "changed contents");
  assert.equal(readUndo(`${body}.x${mac.slice(1)}`, 42, at + 1_000), null, "changed signature");
  assert.equal(readUndo("nonsense", 42, at), null);
});
