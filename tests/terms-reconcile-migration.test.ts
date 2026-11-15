import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// 0148 brings a database that ran the early 0147 draft (528cb2a8: no kind, nullable email, XOR check, cascade) to
// 0147's final shape, and does nothing on a database that ran the final 0147 (Safety, 15 Nov: the shared preview
// database had the draft, so /accept-terms failed with "column kind does not exist").
process.env.DATA_DIR = testDataDir("ft-terms-reconcile-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.VERCEL_ENV;

const DRAFT = `drop table if exists terms_acceptances;
create table terms_acceptances (
  id bigserial primary key,
  user_id bigint references users(id) on delete cascade,
  email text,
  version text not null,
  hash text not null references terms_versions(hash),
  name text not null default '',
  accepted_at bigint not null,
  pdf_sent_at bigint,
  check ((user_id is not null) <> (email is not null))
);
create index if not exists terms_acceptances_user on terms_acceptances (user_id, accepted_at desc) where user_id is not null;
create index if not exists terms_acceptances_email on terms_acceptances (email, accepted_at desc) where email is not null;
create index if not exists terms_acceptances_hash on terms_acceptances (hash);
alter table terms_acceptances enable row level security`;

async function run(sql: string) {
  const { q } = await import("../src/lib/db");
  for (const stmt of sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await q.run(stmt);
}

async function shape() {
  const { q } = await import("../src/lib/db");
  const cols = await q.all<{ column_name: string; is_nullable: string }>(
    "SELECT column_name, is_nullable FROM information_schema.columns WHERE table_name = 'terms_acceptances' ORDER BY column_name",
  );
  const checks = await q.all<{ def: string }>(
    "SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = 'terms_acceptances'::regclass AND contype = 'c' ORDER BY 1",
  );
  const fk = await q.get<{ t: string }>(
    "SELECT confdeltype::text AS t FROM pg_constraint WHERE conrelid = 'terms_acceptances'::regclass AND contype = 'f' AND confrelid = 'users'::regclass",
  );
  const emailIdx = await q.get<{ d: string }>("SELECT indexdef AS d FROM pg_indexes WHERE indexname = 'terms_acceptances_email'");
  const idx = await q.all<{ n: string }>("SELECT indexname AS n FROM pg_indexes WHERE tablename = 'terms_acceptances' ORDER BY 1");
  return { cols, checks: checks.map((c) => c.def), fk: fk?.t, emailIdx: emailIdx?.d, idx: idx.map((i) => i.n) };
}

test("0148 is a no-op on a database that ran the final 0147", async () => {
  const { MIGRATIONS } = await import("../src/lib/db/migrations");
  await import("../src/lib/db").then((m) => m.q.get("SELECT 1"));
  const before = await shape();
  await run(MIGRATIONS.find((m) => m.id === "0148_terms_acceptance_reconcile")!.sql);
  assert.deepEqual(await shape(), before);
  assert.equal(before.checks.length, 2);
  assert.equal(before.fk, "n", "on delete set null");
});

test("0148 brings the 0147 draft to the final shape, keeps every row, and runs twice safely", async () => {
  const { q, now } = await import("../src/lib/db");
  const { MIGRATIONS } = await import("../src/lib/db/migrations");
  const final = await shape();
  await run(DRAFT);
  await q.run("INSERT INTO terms_versions (hash, version, body, created_at) VALUES ('h-draft','1 Nov','x',?) ON CONFLICT (hash) DO NOTHING", now());
  const user = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at) VALUES ('draft-acct@example.test','h','Draft','draftacct','free','dj','UTC',?) RETURNING id",
    now(),
  ))!.id;
  await q.run("INSERT INTO terms_acceptances (user_id, email, version, hash, accepted_at) VALUES (?, NULL, '1 Nov', 'h-draft', 1)", user);
  await q.run("INSERT INTO terms_acceptances (user_id, email, version, hash, accepted_at) VALUES (NULL, 'draft-sender@example.test', '1 Nov', 'h-draft', 2)");

  const sql = MIGRATIONS.find((m) => m.id === "0148_terms_acceptance_reconcile")!.sql;
  await run(sql);
  const after = await shape();
  assert.deepEqual(after.cols, final.cols, "same columns and nullability as the final 0147");
  assert.equal(after.checks.length, 2, "kind check and sender check, old XOR check gone");
  assert.ok(!after.checks.some((d) => d.includes("<>")));
  assert.equal(after.fk, "n", "user_id is on delete set null");
  assert.match(after.emailIdx!, /kind = 'sender'/);
  assert.deepEqual(after.idx, final.idx);
  const rows = await q.all<{ kind: string; email: string; user_id: number | null }>("SELECT kind, email, user_id FROM terms_acceptances ORDER BY accepted_at");
  assert.deepEqual(rows, [
    { kind: "account", email: "draft-acct@example.test", user_id: user },
    { kind: "sender", email: "draft-sender@example.test", user_id: null },
  ]);

  await run(sql);
  assert.deepEqual(await shape(), after, "a second run changes nothing");

  // The app's own write now works on the repaired table.
  const { recordAcceptance, forgetTerms } = await import("../src/lib/terms-record");
  forgetTerms();
  const { added } = await recordAcceptance({ userId: user, email: "draft-acct@example.test" }, "Draft");
  assert.ok(added);
});
