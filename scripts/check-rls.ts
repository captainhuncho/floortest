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
/**
 * Named exceptions, each with its reason (and Safety's review). `tracks.token_hash` (migration 0126) is the SHA-256 of a
 * receipt token: 96 random bits, so the hash can't be turned back into the token, and a lookup hashes what the visitor
 * brings, so the hash itself opens nothing. ft_person keeps its table-wide grant on tracks because desk code run as the
 * person reads whole track rows (`SELECT *`), which a column-by-column grant would break.
 */
const ALLOWED_SECRETS = new Set(["tracks.token_hash"]);
/**
 * users columns ft_person may never change, even on its own row (Safety review of #448, 5 Nov): money, sign-in identity,
 * verification, consent times (set only by the database), the public cover's storage key, routing, and the public page
 * and pause fields the app sets (writing links as the person would skip the Verified reset). As a Postgres regular
 * expression on the column name.
 */
const USERS_NEVER_WRITABLE = "^(plan|email|handle|extra_seats|suspended_at|cover_key|active_collection_id|links|role_line|page_style|paused_at|pause_until|pause_message|product_consent_at|marketing_consent_at|identity_.*)$";

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
  // quietly open a table without saying whose rows are whose. Column-by-column grants count too (0119).
  const { rows: granted } = await pg.query<{ name: string; policies: number }>(
    `select g.table_name as name,
            (select count(*)::int from pg_policies p where p.schemaname = 'public' and p.tablename = g.table_name and 'ft_person' = any(p.roles)) as policies
       from (select table_name from information_schema.role_table_grants where grantee = 'ft_person' and table_schema = 'public'
             union select table_name from information_schema.column_privileges where grantee = 'ft_person' and table_schema = 'public') g
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
  const { rows: lockedUsers } = await pg.query<{ name: string }>(
    `select a.attname as name from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = 'users' and a.attnum > 0 and not a.attisdropped
        and a.attname ~ '${USERS_NEVER_WRITABLE}'
        and (has_column_privilege('ft_person', c.oid, a.attnum, 'UPDATE') or has_column_privilege('ft_person', c.oid, a.attnum, 'INSERT'))
      order by 1`,
  );
  // plan_requests (Safety review of #453): the person files and withdraws, ops decides. The person may never change a
  // decision, the plan asked for, whose it is or its time, nor file one already decided or with its own time.
  const { rows: lockedRequests } = await pg.query<{ name: string }>(
    `select a.attname || ' (' || p.priv || ')' as name
       from pg_attribute a join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
       cross join (values ('UPDATE'), ('INSERT')) p(priv)
      where n.nspname = 'public' and c.relname = 'plan_requests' and a.attnum > 0 and not a.attisdropped
        and ((p.priv = 'UPDATE' and a.attname ~ '^(granted_plan|decided_.*|decision_note|plan|user_id|created_at|kind|org|link|volume|note)$')
          or (p.priv = 'INSERT' and a.attname ~ '^(granted_plan|decided_.*|decision_note|status)$'))
        and has_column_privilege('ft_person', c.oid, a.attnum, p.priv)
      order by 1`,
  );
  // Times set only by the database (migrations 0134 and 0137): each stamping trigger must exist on its table, be on in
  // normal sessions ('O' or 'A'), fire BEFORE, per ROW, on its event, with no WHEN condition, and call the public
  // function. A plan request's time is stamped on insert (the person may still send one; it's ignored).
  const { rows: stampers } = await pg.query<{ name: string }>(
    `select t.tgname as name from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_proc f on f.oid = t.tgfoid join pg_namespace fn on fn.oid = f.pronamespace
      where t.tgenabled in ('O', 'A') and (t.tgtype & 1) = 1 and (t.tgtype & 2) = 2 and t.tgqual is null and fn.nspname = 'public'
        and ((c.relname = 'users' and t.tgname = 'users_consent_times_insert' and (t.tgtype & 4) = 4 and f.proname = 'ft_consent_times')
          or (c.relname = 'users' and t.tgname = 'users_consent_times' and (t.tgtype & 16) = 16 and f.proname = 'ft_consent_times')
          or (c.relname = 'plan_requests' and t.tgname = 'plan_requests_created_at' and (t.tgtype & 4) = 4 and f.proname = 'ft_stamp_created_at'))`,
  );
  // A table ft_person may add rows to must let it draw the row's id: identity columns need nothing more, a plain
  // sequence needs usage (migration 0118), or the insert fails only when that path first runs as the person.
  const { rows: sequences } = await pg.query<{ name: string }>(
    `select s.relname as name
       from pg_class s join pg_depend d on d.objid = s.oid and d.deptype = 'a'
      where s.relkind = 'S' and has_table_privilege('ft_person', d.refobjid, 'INSERT')
        -- CASE, because Postgres may test the privilege before relkind and it errors on anything but a sequence.
        and case when s.relkind = 'S' then not has_sequence_privilege('ft_person', s.oid, 'USAGE') else false end
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
  const flagged = secrets.filter((r) => !ALLOWED_SECRETS.has(r.name));
  if (flagged.length) {
    console.error(`ft_person may use sign-in secret column(s): ${flagged.map((r) => r.name).join(", ")}.`);
    console.error("Grant ft_person only the columns it needs (see migration 0106), never these.");
    process.exit(1);
  }
  if (lockedUsers.length) {
    console.error(`ft_person may write users column(s) that are never the person's: ${lockedUsers.map((r) => r.name).join(", ")}.`);
    console.error("Only the app sets these (migrations 0132 and 0134).");
    process.exit(1);
  }
  if (lockedRequests.length) {
    console.error(`ft_person may write plan_requests column(s) that are ops': ${lockedRequests.map((r) => r.name).join(", ")}.`);
    process.exit(1);
  }
  if (stampers.length !== 3) {
    const missing = ["users_consent_times", "users_consent_times_insert", "plan_requests_created_at"].filter((n) => !stampers.some((r) => r.name === n));
    console.error(`Time-stamping trigger(s) missing, off, or not as they must be (BEFORE, ROW, their event, no WHEN, public function): ${missing.join(", ")} (migrations 0134, 0137).`);
    process.exit(1);
  }
  if (sequences.length) {
    console.error(`ft_person may add rows but not draw their ids from: ${sequences.map((r) => r.name).join(", ")}.`);
    console.error("Use an identity column, or grant usage on the sequence to ft_person (see migration 0118).");
    process.exit(1);
  }
  console.log(`Row-level security check: all ${rows.length} tables have it on; per-person rules on ${granted.length}, no secret columns, every id drawable.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
