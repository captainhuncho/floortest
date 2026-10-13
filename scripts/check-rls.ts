/**
 * Build check: every table must have row-level security switched on. With RLS on and no policies, only the table
 * owner (the app's own connection) can read or write; any other role, such as a hosted data API, sees nothing.
 * Applies every migration to a throwaway in-memory Postgres and asks it, so a table counts however it was made.
 * Fails (exit 1) and names the table, so a migration that adds one must also add
 * `alter table <name> enable row level security;`.
 * Run: tsx scripts/check-rls.ts
 */
import { PGlite } from "@electric-sql/pglite";
import { MIGRATIONS } from "../src/lib/db/migrations";

async function main() {
  const pg = await PGlite.create();
  // The app creates this table itself before migrating (src/lib/db/client.ts); 0002 locks it.
  await pg.exec("create table schema_migrations (id text primary key, applied_at bigint not null)");
  for (const m of MIGRATIONS) await pg.exec(m.sql);

  const { rows } = await pg.query<{ name: string; rls: boolean }>(
    `select c.relname as name, c.relrowsecurity as rls
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p')
      order by c.relname`,
  );
  await pg.close();

  const open = rows.filter((r) => !r.rls).map((r) => r.name);
  if (open.length) {
    console.error(`Row-level security is off on ${open.length} table(s): ${open.join(", ")}.`);
    console.error("Add `alter table <name> enable row level security;` to the migration that creates each one.");
    process.exit(1);
  }
  console.log(`Row-level security check: all ${rows.length} tables have it on.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
