import { migrate, type Db, type Queryable } from "./db/client";
import { STAMP_TRIGGERS } from "./stamp-triggers";
import { findByReceiptToken, openReceiptToken, sealOldReceipts } from "./receipt-token";
import { hashToken } from "./token-hash";

/**
 * A real practice restore (Safety's review of main 91a0e5c, 4 Nov): a nightly backup loaded into an empty Postgres the
 * way a real restore would be, then checked. The command around it (scripts/restore-drill-pg.ts) holds the guards;
 * this is the restore and the checks, so a test can run them against a throwaway database.
 */
export type Dump = { created_at: string; tables: Record<string, Record<string, unknown>[]> };
export type Check = { name: string; ok: boolean; detail: string; skipped?: boolean };
export type DrillOptions = { vaultHead?: (key: string) => Promise<unknown> };

const num = async (db: Queryable, sql: string, ...args: unknown[]) => Number((await db.get<{ n: number }>(sql, ...args))?.n ?? 0);
const ident = (s: string) => `"${s.replace(/"/g, '""')}"`;

/**
 * Why a drill can't run with these settings, or null. A production setting in the shell (DATABASE_URL, POSTGRES_URL),
 * no production endpoint named to refuse (RESTORE_REFUSE_HOSTS: the live database's Neon endpoint id, ep-…), or a target
 * on one of those hosts. The empty-target check (assertEmpty) runs after this, on the connection.
 */
export function drillRefusal(env: NodeJS.ProcessEnv, target: string): string | null {
  const settings = settingsRefusal(env);
  if (settings) return settings;
  const refused = refusedHosts(env);
  let host: string;
  try {
    host = new URL(target).hostname.toLowerCase();
  } catch {
    return "that isn't a postgres:// connection string.";
  }
  if (!host) return "that connection string has no host.";
  return refused.some((h) => host.includes(h)) ? `that target is the production database (${redactHost(host)}).` : null;
}

const refusedHosts = (env: NodeJS.ProcessEnv) => (env.RESTORE_REFUSE_HOSTS ?? "").split(",").map((h) => h.trim().toLowerCase()).filter(Boolean);

/** The part of drillRefusal that needs no target: checked before anything is asked for. */
export function settingsRefusal(env: NodeJS.ProcessEnv): string | null {
  if (env.DATABASE_URL || env.POSTGRES_URL) return "DATABASE_URL or POSTGRES_URL is set in this shell. Unset it: a drill never runs with a production setting around.";
  if (!refusedHosts(env).length) return "set RESTORE_REFUSE_HOSTS to the live database's endpoint id (ep-…, from the Neon console), so it can never be the target.";
  return null;
}

/** A host as the evidence may name it: a Neon endpoint as its region only, never the full name. */
export function redactHost(host: string) {
  if (/^(localhost|127\.0\.0\.1|\[?::1\]?)$/.test(host)) return "a local Postgres";
  const neon = /^ep-[a-z0-9-]+\.([a-z0-9-]+)\.aws\.neon\.tech$/.exec(host) ?? /^ep-[a-z0-9-]+\.([a-z0-9-]+)(?:\.[a-z0-9-]+)*\.neon\.tech$/.exec(host);
  return neon ? `a Neon branch (ep-…, ${neon[1]})` : "a Postgres host (name withheld)";
}

/** Refuses a database that already has anything in it: production, or a branch someone is using. */
export async function assertEmpty(db: Queryable) {
  const tables = await num(db, "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
  if (tables) throw new Error(`The target database isn't empty (${tables} tables). A drill only restores into a new, empty branch or database.`);
}

type Fk = { name: string; child: string; parent: string; cols: string[]; pcols: string[] };

async function foreignKeys(db: Queryable): Promise<Fk[]> {
  const rows = await db.all<{ name: string; child: string; parent: string; cols: string; pcols: string }>(
    `SELECT c.conname AS name, ct.relname AS child, pt.relname AS parent,
            (SELECT string_agg(a.attname, ',' ORDER BY k.i) FROM unnest(c.conkey) WITH ORDINALITY k(n, i) JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n) AS cols,
            (SELECT string_agg(a.attname, ',' ORDER BY k.i) FROM unnest(c.confkey) WITH ORDINALITY k(n, i) JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n) AS pcols
       FROM pg_constraint c JOIN pg_class ct ON ct.oid = c.conrelid JOIN pg_class pt ON pt.oid = c.confrelid
      WHERE c.contype = 'f' AND c.connamespace = 'public'::regnamespace AND NOT c.condeferrable
      ORDER BY 2, 1`,
  );
  return rows.map((r) => ({ ...r, cols: r.cols.split(","), pcols: r.pcols.split(",") }));
}

const identities = (db: Queryable) =>
  db.all<{ table: string; col: string }>(
    `SELECT table_name AS "table", column_name AS col FROM information_schema.columns
      WHERE table_schema = 'public' AND (is_identity = 'YES' OR column_default LIKE 'nextval(%')`,
  );

const stampTriggers = async (db: Queryable) => {
  const have = await db.all<{ tbl: string; name: string }>(
    "SELECT c.relname AS tbl, t.tgname AS name FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'",
  );
  return STAMP_TRIGGERS.filter((s) => have.some((h) => h.tbl === s.tbl && h.name === s.name));
};

/**
 * Migrates the empty database (recording schema_migrations), then loads every table in one transaction with the foreign
 * keys checked once at the end, as a real restore must (rows arrive in any order). Identity sequences are moved past the
 * restored ids. Returns each table's row counts.
 */
export async function restoreInto(db: Db, dump: Dump) {
  await assertEmpty(db);
  await migrate(db);
  const fks = await foreignKeys(db);
  const present = new Set((await db.all<{ t: string }>("SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public'")).map((r) => r.t));
  // Triggers that stamp "now" (consent times, migrations 0134 and 0137; a plan request's time, 0137) would overwrite what
  // the backup holds; consent times are a legal record. They're off while loading, inside the transaction, and back on.
  const stampers = await stampTriggers(db);
  await db.tx(async (t) => {
    for (const s of stampers) await t.run(`ALTER TABLE ${ident(s.tbl)} DISABLE TRIGGER ${ident(s.name)}`);
    for (const f of fks) await t.run(`ALTER TABLE ${ident(f.child)} ALTER CONSTRAINT ${ident(f.name)} DEFERRABLE INITIALLY DEFERRED`);
    for (const [table, rows] of Object.entries(dump.tables)) {
      if (!present.has(table)) throw new Error(`The backup has a table the schema doesn't: ${table}`);
      // Migrations seed some tables (the default plans); the backup holds those rows too, so each starts empty.
      await t.run(`DELETE FROM ${ident(table)}`);
      for (const row of rows) {
        const cols = Object.keys(row);
        const vals = cols.map((c) => (row[c] !== null && typeof row[c] === "object" ? JSON.stringify(row[c]) : row[c]));
        await t.run(`INSERT INTO ${ident(table)} (${cols.map(ident).join(",")}) OVERRIDING SYSTEM VALUE VALUES (${cols.map(() => "?").join(",")})`, ...vals);
      }
    }
    // Every foreign key checked here, inside the transaction, so a broken backup fails loudly and nothing is kept.
    await t.run("SET CONSTRAINTS ALL IMMEDIATE");
    for (const f of fks) await t.run(`ALTER TABLE ${ident(f.child)} ALTER CONSTRAINT ${ident(f.name)} NOT DEFERRABLE`);
    for (const s of stampers) await t.run(`ALTER TABLE ${ident(s.tbl)} ENABLE TRIGGER ${ident(s.name)}`);
  });
  // Consent times as the backup holds them: each restored user's two times must equal the dump's.
  const consentDiffer: number[] = [];
  for (const row of dump.tables.users ?? []) {
    const got = await db.get<{ p: number | null; m: number | null }>("SELECT product_consent_at AS p, marketing_consent_at AS m FROM users WHERE id = ?", row.id);
    const want = { p: (row.product_consent_at ?? null) as number | null, m: (row.marketing_consent_at ?? null) as number | null };
    const same = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Number(a) === Number(b));
    if (!got || !same(got.p, want.p) || !same(got.m, want.m)) consentDiffer.push(Number(row.id));
  }
  const counts: Record<string, { want: number; got: number }> = {};
  for (const [table, rows] of Object.entries(dump.tables)) counts[table] = { want: rows.length, got: await num(db, `SELECT COUNT(*)::int AS n FROM ${ident(table)}`) };
  for (const s of await identities(db)) {
    await db.get(`SELECT setval(pg_get_serial_sequence(?, ?), GREATEST(COALESCE(MAX(${ident(s.col)}), 0), 1), MAX(${ident(s.col)}) IS NOT NULL) FROM ${ident(s.table)}`, s.table, s.col);
  }
  return { counts, fks, consent: { checked: (dump.tables.users ?? []).length, differ: consentDiffer } };
}

/** The checks after a restore. Each says what it looked at; a skipped one says why. */
export async function checkRestore(db: Db, restored: Awaited<ReturnType<typeof restoreInto>>, opts: DrillOptions = {}): Promise<Check[]> {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string) => checks.push({ name, ok, detail });

  const short = Object.entries(restored.counts).filter(([, c]) => c.want !== c.got);
  const rows = Object.values(restored.counts).reduce((n, c) => n + c.got, 0);
  add("Row counts", !short.length, short.length ? short.map(([t, c]) => `${t} ${c.got}/${c.want}`).join(", ") : `${Object.keys(restored.counts).length} tables, ${rows} rows, all match the backup`);

  let orphans = 0;
  const broken: string[] = [];
  for (const f of restored.fks) {
    const on = f.cols.map((c, i) => `p.${ident(f.pcols[i])} = c.${ident(c)}`).join(" AND ");
    const set = f.cols.map((c) => `c.${ident(c)} IS NOT NULL`).join(" AND ");
    const n = await num(db, `SELECT COUNT(*)::int AS n FROM ${ident(f.child)} c WHERE ${set} AND NOT EXISTS (SELECT 1 FROM ${ident(f.parent)} p WHERE ${on})`);
    if (n) broken.push(`${f.child}.${f.cols.join("+")}: ${n}`);
    orphans += n;
  }
  add(
    "Consent times",
    !restored.consent.differ.length,
    restored.consent.differ.length
      ? `${restored.consent.differ.length} of ${restored.consent.checked} users came back with different consent times (ids ${restored.consent.differ.slice(0, 10).join(", ")})`
      : `${restored.consent.checked} users, newsletter and offers consent times as in the backup`,
  );
  add("Foreign keys", !orphans, orphans ? broken.join(", ") : `${restored.fks.length} foreign keys, 0 orphan rows`);

  // The next id each table hands out is past every restored one, so the first insert after a restore can't collide.
  const behind: string[] = [];
  const ids = await identities(db);
  for (const s of ids) {
    const max = await num(db, `SELECT COALESCE(MAX(${ident(s.col)}), 0)::bigint AS n FROM ${ident(s.table)}`);
    const next = await num(db, "SELECT nextval(pg_get_serial_sequence(?, ?))::bigint AS n", s.table, s.col);
    if (next <= max) behind.push(`${s.table}.${s.col} next ${next} ≤ ${max}`);
  }
  add("Identity sequences", !behind.length, behind.length ? behind.join(", ") : `${ids.length} sequences, each next id past the restored ones`);

  checks.push(await personIsolation(db));
  checks.push(...(await receipts(db)));
  checks.push(await vaultFiles(db, opts));
  return checks;
}

/** As one desk's person (the ft_person role, as asPerson sets it), another desk's tracks can't be seen. */
async function personIsolation(db: Db): Promise<Check> {
  const name = "Each person sees only their own desk";
  const desks = await db.all<{ id: number; n: number }>("SELECT user_id AS id, COUNT(*)::int AS n FROM tracks GROUP BY user_id ORDER BY COUNT(*) DESC, user_id");
  const shares = async (a: number, b: number) =>
    !!(await db.get("SELECT 1 FROM account_members WHERE (account_id = ? AND user_id = ?) OR (account_id = ? AND user_id = ?)", a, b, b, a));
  let pair: [number, number] | null = null;
  for (const a of desks) for (const b of desks) if (!pair && a.id !== b.id && !(await shares(a.id, b.id))) pair = [a.id, b.id];
  if (!pair) return { name, ok: true, skipped: true, detail: "Skipped: the backup has no two separate desks with tracks" };
  const [a, b] = pair;
  const seen = await db.tx(async (t) => {
    await t.run("SELECT set_config('role', 'ft_person', true), set_config('ft.person', ?, true)", String(a));
    return { own: await num(t, "SELECT COUNT(*)::int AS n FROM tracks WHERE user_id = ?", a), other: await num(t, "SELECT COUNT(*)::int AS n FROM tracks WHERE user_id = ?", b) };
  });
  const own = desks.find((d) => d.id === a)!.n;
  return { name, ok: seen.other === 0 && seen.own === own, detail: `as desk ${a}: own tracks ${seen.own}/${own}, desk ${b}'s tracks ${seen.other} (must be 0)` };
}

/**
 * Receipts after a restore: a sealed copy opens with APP_SECRET and its token finds its own track; a restored stand-in
 * (backup.ts replaces tracks.token) stays unsealed; and running the sealer changes no hash and breaks no link.
 */
async function receipts(db: Db): Promise<Check[]> {
  type Row = { id: number; token: string | null; token_hash: string | null; token_sealed: string | null };
  const read = () => db.all<Row>("SELECT id, token, token_hash, token_sealed FROM tracks ORDER BY id");
  const opens = async (rows: Row[]) => {
    let good = 0;
    for (const r of rows.filter((x) => x.token_sealed)) {
      const token = openReceiptToken(r.token_sealed!, r.id);
      if (token && hashToken(token) === r.token_hash && (await findByReceiptToken(token, db))?.id === r.id) good++;
    }
    return good;
  };
  const before = await read();
  const sealed = before.filter((r) => r.token_sealed).length;
  const goodBefore = await opens(before);
  const standIns = before.filter((r) => !r.token_sealed && r.token && r.token_hash && hashToken(r.token) !== r.token_hash).length;
  const ran = await sealOldReceipts(10_000, db);
  const after = await read();
  const changed = after.filter((r, i) => before[i].token_hash && r.token_hash !== before[i].token_hash).length;
  const goodAfter = await opens(after);
  return [
    {
      name: "Sealed receipt links open",
      ok: goodBefore === sealed,
      detail: sealed
        ? `${goodBefore}/${sealed} sealed copies open and find their own track${goodBefore === sealed ? "" : " (none open with a wrong APP_SECRET: it must be the one the backup's server used)"}`
        : "No sealed receipts in this backup",
    },
    {
      name: "The sealer after a restore",
      ok: !changed && goodAfter >= goodBefore && ran.receiptsRestoredStandIns === standIns,
      detail: `${standIns} restored stand-in token(s) left unsealed; ${ran.receiptsSealed} real one(s) sealed; ${changed} hash(es) changed (must be 0); ${goodAfter} sealed links open after`,
    },
  ];
}

/** Every file a track, stem or Projects track points to has its copy in the recovery bucket (the vault). */
async function vaultFiles(db: Queryable, { vaultHead }: DrillOptions): Promise<Check> {
  const name = "Files in the recovery bucket";
  if (!vaultHead) return { name, ok: true, skipped: true, detail: "Skipped: no vault credentials in this shell (the S3_* settings and the vault bucket's keys)" };
  const keys = (
    await db.all<{ k: string }>("SELECT file_key AS k FROM tracks WHERE file_key IS NOT NULL AND deleted_at IS NULL UNION SELECT file_key FROM stems WHERE file_key IS NOT NULL UNION SELECT file_key FROM library_tracks")
  ).map((r) => r.k);
  const missing: string[] = [];
  for (const k of keys) if (!(await vaultHead(k))) missing.push(k);
  return { name, ok: !missing.length, detail: missing.length ? `${missing.length} of ${keys.length} missing, first: ${missing.slice(0, 3).join(", ")}` : `${keys.length} of ${keys.length} present` };
}

/** A table cell: backslashes escaped first, then pipes, so a detail ending in "\\" can't break the row (CodeQL 21). */
export const cell = (s: string) => s.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");

/** The evidence file for docs/evidence/: what was restored, each check, and the recovery times. */
export function drillEvidence(r: { date: string; backupKey: string; backupAt: string; target: string; checks: Check[]; rtoMs: number; rpoMs: number; commit: string }) {
  const mins = (ms: number) => `${Math.round(ms / 6000) / 10} min`;
  const failed = r.checks.filter((c) => !c.ok);
  return [
    `# Restore drill into Postgres, ${r.date}`,
    "",
    `- Result: **${failed.length ? `${failed.length} check(s) failed` : "every check passed"}**`,
    `- Backup: \`${r.backupKey}\`, made ${r.backupAt}`,
    `- Target: ${r.target} (new and empty before the drill)`,
    `- Code: ${r.commit} (\`scripts/restore-drill-pg.ts\`)`,
    `- RTO (start of restore to health answering): ${mins(r.rtoMs)}`,
    `- RPO (the backup's age when the drill started: changes after it would be lost): ${mins(r.rpoMs)}`,
    "",
    "| Check | Result | Detail |",
    "|---|---|---|",
    ...r.checks.map((c) => `| ${c.name} | ${c.skipped ? "skipped" : c.ok ? "pass" : "**fail**"} | ${cell(c.detail)} |`),
    "",
  ].join("\n");
}
