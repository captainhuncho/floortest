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

/** Column names that hold sign-in secrets, as a Postgres regular expression. */
const SECRET_COLUMNS = "password|secret|recovery_codes|google_sub|totp_last_step|identity_code|_token$|token_hash$|code_hash$";

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
  // Per-person rules (0097): every table the `ft_person` role may touch needs a policy for it, so a grant can't
  // quietly open a table without saying whose rows are whose.
  const { rows: granted } = await pg.query<{ name: string; policies: number }>(
    `select g.table_name as name,
            (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = g.table_name and 'ft_person' = any(p.roles)) as policies
       from (select distinct table_name from information_schema.role_table_grants where grantee = 'ft_person' and table_schema = 'public') g
      order by 1`,
  );
  // Sign-in secrets (security audit, 29 Oct): ft_person may never read or change a password hash, two-step secret,
  // recovery code, Google id, token or code hash, on any table, whether granted table-wide or column by column.
  const { rows: secrets } = await pg.query<{ name: string }>(
    `select c.relname || '.' || a.attname as name
       from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') and a.attnum > 0 and not a.attisdropped
        and a.attname ~ '${SECRET_COLUMNS}'
        and (has_column_privilege('ft_person', c.oid, a.attnum, 'SELECT')
          or has_column_privilege('ft_person', c.oid, a.attnum, 'INSERT')
          or has_column_privilege('ft_person', c.oid, a.attnum, 'UPDATE'))
      order by 1`,
  );
  await pg.close();

  const open = rows.filter((r) => !r.rls).map((r) => r.name);
  if (open.length) {
    console.error(`Row-level security is off on ${open.length} table(s): ${open.join(", ")}.`);
    console.error("Add `alter table <name> enable row level security;` to the migration that creates each one.");
    process.exit(1);
  }
  const unruled = granted.filter((g) => g.policies === 0).map((g) => g.name);
  if (!granted.length || unruled.length) {
    console.error(granted.length ? `ft_person may use ${unruled.join(", ")} with no policy saying whose rows are whose.` : "ft_person has no tables: migration 0097 missing?");
    process.exit(1);
  }
  if (secrets.length) {
    console.error(`ft_person may use sign-in secret column(s): ${secrets.map((r) => r.name).join(", ")}.`);
    console.error("Grant ft_person only the columns it needs (see migration 0106), never these.");
    process.exit(1);
  }
  console.log(`Row-level security check: all ${rows.length} tables have it on; per-person rules on ${granted.length}, no secret columns.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
