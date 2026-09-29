/**
 * Database access. One Postgres dialect everywhere:
 *   - DATABASE_URL set  → any Postgres (Supabase, Neon, RDS…) via postgres.js
 *   - otherwise         → PGlite, an embedded Postgres persisted under DATA_DIR (local dev, zero setup)
 *
 * Queries use `?` placeholders; they're rewritten to $1, $2… before execution.
 * Kept free of `server-only` so scripts (seed, migrate) can import it.
 */
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { MIGRATIONS } from "./migrations";

export type Row = Record<string, unknown>;

export interface Queryable {
  all<T = Row>(sql: string, ...args: unknown[]): Promise<T[]>;
  get<T = Row>(sql: string, ...args: unknown[]): Promise<T | undefined>;
  run(sql: string, ...args: unknown[]): Promise<{ changes: number }>;
}

export interface Db extends Queryable {
  /** Runs `fn` in a transaction. Keep it free of slow external calls (email, storage). */
  tx<T>(fn: (q: Queryable) => Promise<T>): Promise<T>;
  kind: "postgres" | "pglite";
  close(): Promise<void>;
}

/** `?` → `$n`, skipping quoted strings and identifiers. */
export function toPositional(sql: string) {
  let n = 0;
  let out = "";
  let quote: string | null = null;
  for (const ch of sql) {
    if (quote) {
      if (ch === quote) quote = null;
      out += ch;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      out += ch;
    } else if (ch === "?") {
      out += `$${++n}`;
    } else out += ch;
  }
  return out;
}

type Raw = { query(sql: string, params: unknown[]): Promise<{ rows: Row[]; changes: number }> };

function wrap(raw: Raw): Queryable {
  return {
    async all<T>(sql: string, ...args: unknown[]) {
      return (await raw.query(toPositional(sql), args)).rows as T[];
    },
    async get<T>(sql: string, ...args: unknown[]) {
      return (await raw.query(toPositional(sql), args)).rows[0] as T | undefined;
    },
    async run(sql: string, ...args: unknown[]) {
      return { changes: (await raw.query(toPositional(sql), args)).changes };
    },
  };
}

async function openPostgres(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  const max = Math.max(1, Number(process.env.DB_POOL_MAX || 5));
  const sql = postgres(url, {
    max,
    idle_timeout: 20,
    // Works behind transaction-mode poolers (Supabase :6543, PgBouncer).
    prepare: false,
    // bigint (epoch-ms timestamps, ids, counts) as JS numbers; all values stay well below 2^53.
    types: { bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) } },
    onnotice: () => {},
  });
  type Unsafe = { unsafe(text: string, params: never[]): Promise<Row[] & { count?: number }> };
  const rawOf = (s: Unsafe): Raw => ({
    async query(text, params) {
      const res = await s.unsafe(text, params as never[]);
      return { rows: [...res], changes: res.count ?? 0 };
    },
  });
  // Never run more queries at once than there are connections. Beyond that, postgres.js
  // pipelines queries onto busy connections, which transaction-mode poolers (Supabase :6543)
  // don't handle: statements stall until they hit the statement timeout.
  let busy = 0;
  const waiting: (() => void)[] = [];
  const slot = async <T>(work: () => Promise<T>): Promise<T> => {
    if (busy >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else busy++;
    try {
      return await work();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else busy--;
    }
  };
  const pooled = rawOf(sql as unknown as Unsafe);
  return {
    ...wrap({ query: (text, params) => slot(() => pooled.query(text, params)) }),
    kind: "postgres",
    async tx(fn) {
      // A transaction holds one connection for its whole length, so it takes one slot.
      return slot(async () => (await sql.begin((t) => fn(wrap(rawOf(t as unknown as Unsafe))))) as never);
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

async function openPglite(dir: string): Promise<Db> {
  const { PGlite, types } = await import("@electric-sql/pglite");
  await mkdir(dir, { recursive: true }); // first run on a fresh install
  const pg = await PGlite.create(dir, { parsers: { [types.INT8]: (v: string) => Number(v) } });
  const rawOf = (q: { query: typeof pg.query }): Raw => ({
    async query(text, params) {
      const res = await q.query<Row>(text, params);
      return { rows: res.rows, changes: res.affectedRows ?? 0 };
    },
  });
  return {
    ...wrap(rawOf(pg)),
    kind: "pglite",
    async tx(fn) {
      return pg.transaction((t) => fn(wrap(rawOf(t))));
    },
    async close() {
      await pg.close();
    },
  };
}

/** Applies pending migrations. On Postgres an advisory lock keeps concurrent cold starts from racing. */
export async function migrate(db: Db) {
  await db.run("create table if not exists schema_migrations (id text primary key, applied_at bigint not null)");
  await db.tx(async (q) => {
    if (db.kind === "postgres") await q.run("select pg_advisory_xact_lock(724501)");
    const done = new Set((await q.all<{ id: string }>("select id from schema_migrations")).map((r) => r.id));
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      // Multi-statement scripts: run each statement (postgres.js unsafe() takes one at a time with params).
      for (const stmt of m.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await q.run(stmt);
      await q.run("insert into schema_migrations (id, applied_at) values (?, ?)", m.id, Date.now());
    }
  });
}

export function dataDir() {
  return path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || "./data");
}

type G = typeof globalThis & { __floortestDb?: Promise<Db> };

/** Shared connection for this process, migrated on first use. */
export function getDb(): Promise<Db> {
  const g = globalThis as G;
  if (!g.__floortestDb) {
    g.__floortestDb = (async () => {
      const url = process.env.DATABASE_URL;
      // On Vercel the disk is read-only, so the embedded fallback can only fail confusingly.
      if (!url && process.env.VERCEL) throw new Error(`DATABASE_URL is not set for this ${process.env.VERCEL_ENV ?? "Vercel"} deployment.`);
      const db = url ? await openPostgres(url) : await openPglite(path.join(dataDir(), "pg"));
      if (process.env.DB_AUTO_MIGRATE !== "false") await migrate(db);
      return db;
    })().catch((e) => {
      g.__floortestDb = undefined; // let the next request retry instead of caching the failure
      throw e;
    });
  }
  return g.__floortestDb;
}
