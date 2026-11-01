import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { MIGRATIONS } from "../src/lib/db/migrations";

// 1 Nov: the daily email caps count the outbox by status and send time on every email. The planner must be able to
// answer them from outbox_status_attempt instead of reading every row. (The stuck-send sweep already has outbox_due.)
test("the daily email cap counts can use the outbox status and send-time index", async () => {
  const pg = await PGlite.create();
  await pg.exec("create table schema_migrations (id text primary key, applied_at bigint not null)");
  for (const m of MIGRATIONS) await pg.exec(m.sql);
  await pg.exec(`insert into outbox (to_email, subject, body, status, created_at, last_attempt_at)
    select 'r' || g || '@out.io', 'S', 'B', case when g % 10 = 0 then 'sending' else 'sent' end, g, g from generate_series(1, 3000) g;
    analyze outbox;
    set enable_seqscan = off;`);
  const plan = async (sql: string) => (await pg.query<{ "QUERY PLAN": string }>(`explain ${sql}`)).rows.map((r) => r["QUERY PLAN"]).join("\n");
  for (const sql of [
    "SELECT COUNT(*) AS n FROM outbox WHERE status = 'sent' AND last_attempt_at >= 2900",
    "SELECT COUNT(*) AS n FROM outbox WHERE status IN ('sent', 'sending') AND last_attempt_at >= 2900",
  ])
    assert.match(await plan(sql), /outbox_status_attempt/, sql);
  await pg.close();
});
