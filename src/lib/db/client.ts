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

/**
 * `?` → `$n`, skipping quoted strings and identifiers, E'' strings, dollar quotes and comments, so a `?` in any of them
 * never shifts the parameters. The jsonb `?`, `?|` and `?&` operators can't be told apart from a placeholder: use
 * jsonb_exists(), jsonb_exists_any() or jsonb_exists_all() instead.
 */
export function toPositional(sql: string) {
  let n = 0;
  let out = "";
  let i = 0;
  // Copies sql[i..end) unchanged and moves past it.
  const copy = (end: number) => {
    out += sql.slice(i, end);
    i = end;
  };
  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (ch === "'" || ch === '"') {
      // E'...' strings let a backslash escape the quote; in the others a quote is escaped by doubling it.
      const backslash = ch === "'" && /[eE]/.test(sql[i - 1] ?? "") && !/[\w$]/.test(sql[i - 2] ?? "");
      let j = i + 1;
      while (j < sql.length) {
        if (backslash && sql[j] === "\\") j += 2;
        else if (sql[j] === ch && sql[j + 1] === ch) j += 2;
        else if (sql[j] === ch) break;
        else j++;
      }
      copy(Math.min(j + 1, sql.length));
    } else if (ch === "-" && next === "-") {
      const end = sql.indexOf("\n", i);
      copy(end < 0 ? sql.length : end);
    } else if (ch === "/" && next === "*") {
      // Postgres block comments nest.
      let depth = 0;
      let j = i;
      while (j < sql.length) {
        if (sql[j] === "/" && sql[j + 1] === "*") {
          depth++;
          j += 2;
        } else if (sql[j] === "*" && sql[j + 1] === "/") {
          j += 2;
          if (--depth === 0) break;
        } else j++;
      }
      copy(j);
    } else if (ch === "$" && !/[\w$]/.test(sql[i - 1] ?? "")) {
      // A dollar quote ($$...$$ or $tag$...$tag$); "$1" or a "$" inside a name is not one.
      const tag = /^\$(?:[A-Za-z_][\w]*)?\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        copy(end < 0 ? sql.length : end + tag.length);
      } else copy(i + 1);
    } else if (ch === "?") {
      out += `$${++n}`;
      i++;
    } else copy(i + 1);
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
    // Any database across the internet (Neon) must be encrypted; it fails rather than falling back to plain text.
    // Only a database on this machine may skip it.
    ssl: /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url) ? undefined : "require",
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
