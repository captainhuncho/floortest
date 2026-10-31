import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Send only the fields needed (owner, 27 Oct). A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-receipt-columns-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("the receipt reads only the columns it shows, never the decision or the file's key", async () => {
  const { q } = await import("../src/lib/db");
  const { receiptByToken, RECEIPT_TRACK_COLUMNS } = await import("../src/lib/receipt");
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('r@x.io','h','Rae','rae','pro','UTC',?,?) RETURNING id", t, t))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@x.io', 'S', ?) RETURNING id", uid, t))!.id;
  await q.run(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, decision, decided_at) VALUES (?,?,'T','A','cols-track','audio/secret.wav','x.wav','audio/wav',1,?,'passed',?)",
    uid, sender, t, t,
  );

  const r = await receiptByToken("cols-track");
  assert.ok(r, "the receipt is found by its token");
  const extra = ["receiver", "receiver_handle", "receiver_status", "receiver_plan", "collection", "sender_email", "verified_at", "sender_account"];
  assert.deepEqual(Object.keys(r).sort(), [...RECEIPT_TRACK_COLUMNS, ...extra].sort());
  for (const k of ["decision", "decided_at", "file_key", "original_name", "token", "sender_id"]) assert.ok(!(k in r), `${k} is not read`);
  assert.equal(r.receiver, "Rae");
  assert.equal(await receiptByToken("no-such-token"), undefined);
});
