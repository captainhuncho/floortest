import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { toPositional } from "../src/lib/db/client";
import { MIGRATIONS } from "../src/lib/db/migrations";
import { DECIDE_WITHIN, northStar } from "../src/lib/north-star";

const DAY = 86_400_000;

test("north star: decided within 7 days, only for tracks whose 7 days are over, split by plan and desk size", async () => {
  const pg = await PGlite.create();
  await pg.exec("create table schema_migrations (id text primary key, applied_at bigint not null)");
  for (const m of MIGRATIONS) await pg.exec(m.sql);
  const db = {
    run: async (sql: string, ...a: unknown[]) => ({ changes: (await pg.query(toPositional(sql), a)).affectedRows ?? 0 }),
    get: async <T,>(sql: string, ...a: unknown[]) => (await pg.query(toPositional(sql), a)).rows[0] as T | undefined,
    all: async <T,>(sql: string, ...a: unknown[]) => (await pg.query(toPositional(sql), a)).rows as T[],
  };
  const at = 100 * DAY;
  // A solo Free desk and a Team desk with one member.
  await db.run("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at) VALUES ('a@x.io','h','A','a','free','UTC',0), ('b@x.io','h','B','b','team','UTC',0), ('m@x.io','h','M','m','free','UTC',0)");
  await db.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (2, 3, 'member', 0)");
  await db.run("INSERT INTO senders (user_id, email, name, created_at) VALUES (1,'s@x.io','S',0), (2,'s@x.io','S',0)");
  const track = (user: number, sender: number, created: number, decided: number | null) =>
    db.run(
      "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at, decided_at, decision) VALUES (?,?,'T','A',?, 'k','t.wav','audio/wav',1,?,?,?)",
      user, sender, `t${created}-${user}-${decided}`, created, decided, decided ? "kept" : null,
    );
  const w1 = at - 20 * DAY; // a week fully matured
  await track(1, 1, w1, w1 + 2 * DAY); // decided in time
  await track(1, 1, w1 + DAY, w1 + DAY + DECIDE_WITHIN + 1); // decided, but too late
  await track(1, 1, w1 + DAY, null); // never decided
  await track(2, 2, w1 + 2 * DAY, w1 + 3 * DAY); // team desk, in time
  await track(2, 2, at - 3 * DAY, null); // still inside its 7 days: not counted yet

  const r = await northStar(db, [w1, w1 + 7 * DAY, w1 + 14 * DAY], at, at);
  assert.deepEqual(r.total, { tracks: 4, decided: 2 });
  assert.deepEqual(r.weeks.map((w) => [w.tracks, w.decided]), [[4, 2], [0, 0], [0, 0]]);
  assert.deepEqual(r.byPlan, { free: { tracks: 3, decided: 1 }, team: { tracks: 1, decided: 1 } });
  assert.deepEqual(r.bySize, { solo: { tracks: 3, decided: 1 }, team: { tracks: 1, decided: 1 } });
});
