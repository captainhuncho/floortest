// One-off: copy the live database from Supabase to Neon.
//
// Reads two addresses from .env.neon (never committed, never printed):
//   SUPABASE_DATABASE_URL=...  the current live database
//   NEON_DATABASE_URL=...      the new Neon database (direct, not pooled)
//
// Run:  npx tsx --env-file=.env.neon scripts/copy-to-neon.ts           (copy into an empty Neon database)
//       npx tsx --env-file=.env.neon scripts/copy-to-neon.ts --check   (compare row counts only)
//
// Steps: build the schema on Neon with FloorTest's own migrations, copy every table, restore ID counters,
// then compare row counts table by table. The source is only ever read.
import postgres from "postgres";
import { MIGRATIONS } from "../src/lib/db/migrations";

const SRC = process.env.SUPABASE_DATABASE_URL;
const DST = process.env.NEON_DATABASE_URL;
if (!SRC || !DST) throw new Error("Put SUPABASE_DATABASE_URL and NEON_DATABASE_URL in .env.neon");
if (SRC === DST) throw new Error("The two addresses are the same.");

const src = postgres(SRC, { ssl: "require", max: 2, prepare: false });
const dst = postgres(DST, { ssl: "require", max: 2 });
const checkOnly = process.argv.includes("--check");

type Tbl = { table_name: string };
const tables = async (db: postgres.Sql) =>
  (await db<Tbl[]>`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`).map((t) => t.table_name);
const count = async (db: postgres.Sql, t: string) => Number((await db.unsafe(`select count(*)::bigint as n from "${t}"`))[0].n);

async function compare() {
  let ok = true;
  for (const t of await tables(src)) {
    const [a, b] = [await count(src, t), await count(dst, t).catch(() => -1)];
    if (a !== b) ok = false;
    console.log(`${a === b ? "ok  " : "DIFF"} ${t.padEnd(32)} ${a} → ${b}`);
  }
  console.log(ok ? "\nAll tables match." : "\nSome tables differ: see DIFF lines.");
  return ok;
}

(async () => {
  if (checkOnly) return void (await compare());

  // 1. Refuse to copy into a database that already has FloorTest data.
  if ((await tables(dst)).includes("users") && (await count(dst, "users")) > 0) throw new Error("Neon already has users. Use --check, or start from an empty branch.");

  // 2. Schema: FloorTest's own migrations, in order, so Neon matches the code exactly.
  await dst.unsafe("create table if not exists schema_migrations (id text primary key, applied_at bigint not null)");
  const applied = new Set((await dst<{ id: string }[]>`select id from schema_migrations`).map((r) => r.id));
  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    await dst.begin(async (tx) => {
      await tx.unsafe(m.sql);
      await tx`insert into schema_migrations (id, applied_at) values (${m.id}, ${Date.now()})`;
    });
  }
  const srcMigs = (await src<{ id: string }[]>`select id from schema_migrations order by id`).map((r) => r.id);
  const missing = MIGRATIONS.map((m) => m.id).filter((id) => !srcMigs.includes(id));
  if (missing.length) throw new Error(`Live database is behind the code (missing ${missing.join(", ")}). Deploy first, then copy.`);
  console.log(`Schema ready (${MIGRATIONS.length} migrations).`);

  // 3. Foreign keys off while copying (tables reference each other in loops), back on and re-checked after.
  const fks = await dst<{ tbl: string; name: string; def: string }[]>`
    select c.conrelid::regclass::text as tbl, c.conname as name, pg_get_constraintdef(c.oid) as def
    from pg_constraint c join pg_namespace n on n.oid = c.connamespace where c.contype = 'f' and n.nspname = 'public'`;
  for (const f of fks) await dst.unsafe(`alter table ${f.tbl} drop constraint "${f.name}"`);

  // 4. Copy each table in batches. Identity columns keep their original IDs.
  for (const t of await tables(src)) {
    if (t === "schema_migrations") continue;
    await dst.unsafe(`delete from "${t}"`);
    const cols = (await src<{ column_name: string }[]>`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${t} order by ordinal_position`).map((c) => c.column_name);
    const dstCols = new Set((await dst<{ column_name: string }[]>`select column_name from information_schema.columns where table_schema = 'public' and table_name = ${t}`).map((c) => c.column_name));
    const use = cols.filter((c) => dstCols.has(c));
    const identity = (await dst<{ n: number }[]>`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = ${t} and is_identity = 'YES'`)[0].n > 0;
    let copied = 0;
    const cursor = src.unsafe(`select ${use.map((c) => `"${c}"`).join(", ")} from "${t}"`).cursor(500);
    for await (const rows of cursor) {
      const values = rows.map((r) => use.map((c) => r[c]));
      const ph = values.map((row, i) => `(${row.map((_, j) => `$${i * use.length + j + 1}`).join(",")})`).join(",");
      await dst.unsafe(`insert into "${t}" (${use.map((c) => `"${c}"`).join(", ")}) ${identity ? "overriding system value" : ""} values ${ph}`, values.flat() as never[]);
      copied += rows.length;
    }
    console.log(`copied ${t}: ${copied}`);
  }

  // 5. Foreign keys back on: re-adding them checks every row, so a broken link fails loudly here.
  for (const f of fks) await dst.unsafe(`alter table ${f.tbl} add constraint "${f.name}" ${f.def}`);

  // 6. Identity counters continue after the highest copied ID.
  const ids = await dst<{ table_name: string; column_name: string }[]>`select table_name, column_name from information_schema.columns where table_schema = 'public' and is_identity = 'YES'`;
  for (const { table_name: t, column_name: c } of ids)
    await dst.unsafe(`select setval(pg_get_serial_sequence('"${t}"', '${c}'), coalesce((select max("${c}") from "${t}"), 0) + 1, false)`);

  console.log("\nCopy finished. Checking:\n");
  await compare();
})()
  .catch((e) => {
    console.error("\nStopped:", e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await src.end();
    await dst.end();
  });
