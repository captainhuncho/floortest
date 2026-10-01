import assert from "node:assert/strict";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { toPositional } from "../src/lib/db/client";
import { MIGRATIONS } from "../src/lib/db/migrations";
import { CLAIM_CANCEL, CLAIM_FINAL, MARK_SHAREABLE } from "../src/lib/consent-sql";

const WINDOW = 120_000;

async function setup() {
  const pg = await PGlite.create();
  await pg.exec("create table schema_migrations (id text primary key, applied_at bigint not null)");
  for (const m of MIGRATIONS) await pg.exec(m.sql);
  const run = async (sql: string, ...a: unknown[]) => (await pg.query(toPositional(sql), a)).rows as Record<string, unknown>[];
  await run("INSERT INTO users (email, password_hash, name, handle, tz, created_at) VALUES ('r@x.io','h','R','r','UTC',0)");
  await run("INSERT INTO senders (user_id, email, name, created_at) VALUES (1,'a@x.io','A',0)");
  await run(
    "INSERT INTO tracks (user_id, sender_id, title, artist, token, file_key, original_name, mime, size, created_at) VALUES (1,1,'T','A','tok','k','t.wav','audio/wav',1,0)",
  );
  return { pg, run };
}

const allowAt = (run: (s: string, ...a: unknown[]) => Promise<unknown>, t: number) =>
  run("INSERT INTO share_requests (track_id, status, created_at, decided_at) VALUES (1, 'allowed', ?, ?)", t, t);

/** What finalizeConsent does: claim, then flip the track. Returns true if this call made it final. */
async function finalize(run: (s: string, ...a: unknown[]) => Promise<Record<string, unknown>[]>, now: number) {
  const [r] = await run(CLAIM_FINAL, now, 1, now - WINDOW);
  if (!r) return false;
  return (await run(MARK_SHAREABLE, r.downloads, 1)).length === 1;
}

test("cancelling just before the deadline wins, and the track never becomes shareable", async () => {
  const { run } = await setup();
  await allowAt(run, 1_000);
  const now = 1_000 + WINDOW - 1;
  assert.equal((await run(CLAIM_CANCEL + " RETURNING id", 1, now - WINDOW)).length, 1);
  assert.equal(await finalize(run, now + 10_000), false);
  assert.equal((await run("SELECT share_ok FROM tracks WHERE id = 1"))[0].share_ok, 0);
});

test("after the deadline, cancel loses and finalising works once", async () => {
  const { run } = await setup();
  await allowAt(run, 1_000);
  const now = 1_000 + WINDOW + 1;
  assert.equal((await run(CLAIM_CANCEL + " RETURNING id", 1, now - WINDOW)).length, 0);
  assert.equal(await finalize(run, now), true);
  assert.equal(await finalize(run, now + 5_000), false, "a second finalise must not send another email");
});

test("cancel and finalise racing at the deadline: exactly one wins", async () => {
  const { run } = await setup();
  await allowAt(run, 1_000);
  const edge = 1_000 + WINDOW; // cancel thinks it's still inside (clock a hair behind), finalise thinks it's past
  const [cancelled, finalised] = await Promise.all([run(CLAIM_CANCEL + " RETURNING id", 1, edge - 1 - WINDOW), finalize(run, edge)]);
  assert.equal(Number(cancelled.length === 1) + Number(finalised), 1);
  const [row] = await run("SELECT status, finalized_at FROM share_requests WHERE id = 1");
  const [track] = await run("SELECT share_ok FROM tracks WHERE id = 1");
  if (row.status === "cancelled") assert.equal(track.share_ok, 0);
  else assert.ok(row.finalized_at && track.share_ok === 1);
});
