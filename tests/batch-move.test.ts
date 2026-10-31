import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-batch-move-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

test("logEvents writes every row in one insert, with the actor only when it's someone else", async () => {
  const { q, logEvents } = await import("../src/lib/db");
  const t = Date.now();
  const desk = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('batch@desk.io', 'h', 'B', 'batchdesk', 'pro', 'UTC', ?) RETURNING id",
    t,
  ))!.id;
  const mate = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('mate@desk.io', 'h', 'M', 'batchmate', 'free', 'UTC', ?) RETURNING id",
    t,
  ))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@batch.io', 'S', ?) RETURNING id", desk, t))!.id;
  await logEvents([]);
  await logEvents([
    { user_id: desk, actor_id: desk, sender_id: sender, track_id: null, type: "moved", detail: "to A" },
    { user_id: desk, actor_id: mate, sender_id: sender, track_id: null, type: "moved", detail: "to A" },
  ]);
  const rows = await q.all<{ actor_id: number | null; created_at: number }>("SELECT actor_id, created_at FROM events WHERE user_id = ? AND type = 'moved' ORDER BY id", desk);
  assert.deepEqual(rows.map((r) => (r.actor_id === null ? null : Number(r.actor_id))), [null, mate]);
  assert.equal(Number(rows[0].created_at), Number(rows[1].created_at), "one batch, one time");
});

test("a batch move is one update and one activity insert, in a transaction, limited to the desk's own tracks", () => {
  // Server actions need a signed-in request, so this checks the code path.
  const src = fs.readFileSync(new URL("../src/app/dashboard/actions/batch.ts", import.meta.url), "utf8");
  const move = src.slice(src.indexOf('} else if (type === "move")'), src.indexOf('} else if (type === "delete")'));
  assert.doesNotMatch(move, /for \(const t of/, "no query per track");
  assert.match(move, /q\.tx\(/);
  assert.match(move, /UPDATE tracks SET collection_id = \? WHERE user_id = \? AND id IN/);
  assert.match(move, /logEvents\(/);
});
