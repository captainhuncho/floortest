import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-two-step-ticket-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("the two-step ticket is a one-time server row: used once, then it stops working", async () => {
  const { q } = await import("../src/lib/db");
  const { issueTicket, ticketUser, spendTicket } = await import("../src/lib/two-step-ticket");
  const me = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('me@x.io', 'h', 'Me', 'me', 'pro', 'UTC', ?) RETURNING id", Date.now()))!.id;
  const id = await issueTicket(me);
  assert.equal(await ticketUser(id), me);
  assert.equal(await ticketUser(id + "x"), null, "a changed ticket is unknown");
  assert.ok(!(await q.get("SELECT 1 FROM two_step_tickets WHERE id_hash = ?", id)), "only its hash is stored");
  assert.equal(await spendTicket(id, me), true);
  assert.equal(await ticketUser(id), null, "after the second step it can't be replayed");
  assert.equal(await spendTicket(id, me), false, "nor used twice");

  const late = await issueTicket(me);
  await q.run("UPDATE two_step_tickets SET expires_at = ? WHERE user_id = ?", Date.now() - 1, me);
  assert.equal(await ticketUser(late), null, "expired after 5 minutes");
});
