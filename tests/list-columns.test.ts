import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-list-columns-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// 1 Nov: the desk lists read every track column (receipt token, file keys and all) for up to 500 rows. They now name
// only the columns the screens use.
test("the desk lists name their columns and never read the token or file keys", async () => {
  const { LIST_COLUMNS } = await import("../src/app/dashboard/rows");
  for (const secret of ["token", "file_key", "art_key", "original_name"]) assert.doesNotMatch(LIST_COLUMNS, new RegExp(`\\bt\\.${secret}\\b`), secret);
  for (const file of ["rows.ts", "list/SubmissionsList.tsx", "review/page.tsx", "collections/[id]/page.tsx"]) {
    const src = fs.readFileSync(new URL(`../src/app/dashboard/${file}`, import.meta.url), "utf8");
    const lists = src.split("LIMIT 500").slice(0, -1).map((s) => s.slice(s.lastIndexOf("SELECT")));
    assert.ok(lists.length, `${file} still has its list query`);
    for (const sql of lists) assert.doesNotMatch(sql, /SELECT t\.\*/, file);
  }
});

test("loadRows still fills every list field from the named columns", async () => {
  const { q } = await import("../src/lib/db");
  const { loadRows } = await import("../src/app/dashboard/rows");
  const t = Date.now();
  const desk = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('cols@desk.io', 'h', 'C', 'colsdesk', 'pro', 'UTC', ?) RETURNING id", t))!.id;
  const sender = (await q.get<{ id: number }>("INSERT INTO senders (user_id, email, name, created_at) VALUES (?, 's@cols.io', 'Sam', ?) RETURNING id", desk, t))!.id;
  await q.run(
    `INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, genre, duration, bpm, peaks, message, played_at, decision, decided_at)
     VALUES (?,?,'Night Bus','DJ A','tok-cols','audio/c.wav','c.wav','audio/wav',1,?,'House',300,124,'[0.1,0.5]','Hi',?,'kept',?)`,
    desk, sender, t, t, t,
  );
  const [row] = await loadRows(desk, { keptOnly: true, actor: desk });
  assert.equal(row.title, "Night Bus");
  assert.equal(row.sender, "Sam");
  assert.equal(row.genre, "House");
  assert.equal(Number(row.bpm), 124);
  assert.deepEqual(row.peaks, [0.1, 0.5]);
  assert.equal(row.played, true);
  assert.equal(row.hasMessage, true);
  assert.equal(row.decision, "kept");
  assert.equal(row.cueCount, 0);
  assert.ok(!("token" in row) && !("file_key" in row));
});
