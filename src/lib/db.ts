import "server-only";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export const DATA_DIR = path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR || "./data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
export const COVER_DIR = path.join(DATA_DIR, "covers");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  handle TEXT NOT NULL UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  active_collection_id INTEGER,
  role_line TEXT NOT NULL DEFAULT '',
  cover_file TEXT,
  page_style TEXT NOT NULL DEFAULT 'classic',
  notifications_seen_at INTEGER,
  notify_submissions TEXT NOT NULL DEFAULT 'digest',
  digest_hour INTEGER NOT NULL DEFAULT 9,
  quiet_start INTEGER,
  quiet_end INTEGER,
  notify_alerts INTEGER NOT NULL DEFAULT 1,
  tz TEXT NOT NULL DEFAULT 'UTC',
  last_digest_at INTEGER,
  alert_full_sent_at INTEGER,
  referral_code TEXT,
  referred_by INTEGER,
  referral_rewarded_at INTEGER,
  bonus_songs INTEGER NOT NULL DEFAULT 0,
  paused_at INTEGER,
  pause_until INTEGER,
  pause_message TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS collections (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  closes_at INTEGER,
  brief_wanted TEXT NOT NULL DEFAULT '',
  bpm_min INTEGER,
  bpm_max INTEGER,
  brief_note TEXT NOT NULL DEFAULT '',
  genres TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS senders (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  verified_at INTEGER,
  verify_token TEXT,
  blocked_at INTEGER,
  UNIQUE(user_id, email)
);
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  collection_id INTEGER REFERENCES collections(id) ON DELETE SET NULL,
  sender_id INTEGER NOT NULL REFERENCES senders(id),
  token TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  file_name TEXT,
  original_name TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  duration REAL,
  bpm REAL,
  peaks TEXT,
  played_at INTEGER,
  downloaded_at INTEGER,
  shortlisted INTEGER NOT NULL DEFAULT 0,
  decision TEXT,
  decided_at INTEGER,
  release_status TEXT NOT NULL DEFAULT '',
  mix_status TEXT NOT NULL DEFAULT '',
  genre TEXT NOT NULL DEFAULT '',
  replied_at INTEGER,
  receiver_notified_at INTEGER,
  deleted_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tracks_user ON tracks(user_id, deleted_at);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_id INTEGER NOT NULL REFERENCES senders(id),
  track_id INTEGER REFERENCES tracks(id),
  type TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_sender ON events(sender_id, created_at);
CREATE TABLE IF NOT EXISTS upload_attempts (
  id INTEGER PRIMARY KEY,
  receiver_id INTEGER NOT NULL,
  ip TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS upload_attempts_recent ON upload_attempts(receiver_id, created_at);
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  audience TEXT NOT NULL DEFAULT 'sender',
  created_at INTEGER NOT NULL
);
`;

type G = typeof globalThis & { __floortestDb?: DatabaseSync; __floortestSchema?: number };

/** Bump when migrate() gains a step, so a hot-reloaded dev server re-runs it on its cached connection. */
const SCHEMA_VERSION = 7;

function open() {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.mkdirSync(COVER_DIR, { recursive: true });
  const db = new DatabaseSync(path.join(DATA_DIR, "floortest.db"));
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  migrate(db);
  return db;
}

/** Additive migrations for databases created by earlier builds. */
function migrate(db: DatabaseSync) {
  const has = (table: string, col: string) =>
    (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).some((c) => c.name === col);
  const add = (table: string, col: string, def: string) => {
    if (!has(table, col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
  };
  add("tracks", "decision", "TEXT"); // 'kept' | 'passed' | NULL (needs review)
  add("tracks", "decided_at", "INTEGER");
  add("tracks", "release_status", "TEXT NOT NULL DEFAULT ''");
  add("tracks", "replied_at", "INTEGER");
  add("senders", "verified_at", "INTEGER");
  add("senders", "verify_token", "TEXT");
  add("senders", "blocked_at", "INTEGER");
  add("collections", "closes_at", "INTEGER");
  add("collections", "brief_wanted", "TEXT NOT NULL DEFAULT ''");
  add("collections", "bpm_min", "INTEGER");
  add("collections", "bpm_max", "INTEGER");
  add("collections", "brief_note", "TEXT NOT NULL DEFAULT ''");
  add("tracks", "mix_status", "TEXT NOT NULL DEFAULT ''");
  add("users", "role_line", "TEXT NOT NULL DEFAULT ''");
  add("users", "cover_file", "TEXT");
  add("users", "page_style", "TEXT NOT NULL DEFAULT 'classic'");
  add("users", "notifications_seen_at", "INTEGER");
  add("users", "notify_submissions", "TEXT NOT NULL DEFAULT 'digest'");
  add("users", "digest_hour", "INTEGER NOT NULL DEFAULT 9");
  add("users", "quiet_start", "INTEGER");
  add("users", "quiet_end", "INTEGER");
  add("users", "notify_alerts", "INTEGER NOT NULL DEFAULT 1");
  add("users", "tz", "TEXT NOT NULL DEFAULT 'UTC'");
  add("users", "last_digest_at", "INTEGER");
  add("users", "alert_full_sent_at", "INTEGER");
  add("users", "referral_code", "TEXT");
  add("users", "referred_by", "INTEGER");
  add("users", "referral_rewarded_at", "INTEGER");
  add("users", "bonus_songs", "INTEGER NOT NULL DEFAULT 0");
  add("users", "paused_at", "INTEGER");
  add("collections", "genres", "TEXT NOT NULL DEFAULT ''");
  add("tracks", "genre", "TEXT NOT NULL DEFAULT ''");
  add("users", "pause_until", "INTEGER");
  add("users", "pause_message", "TEXT NOT NULL DEFAULT ''");
  add("tracks", "receiver_notified_at", "INTEGER");
  add("outbox", "audience", "TEXT NOT NULL DEFAULT 'sender'");
  db.exec("CREATE UNIQUE INDEX IF NOT EXISTS users_referral_code ON users(referral_code)");
  // The old "shortlisted" flag becomes an explicit Keep decision.
  db.exec("UPDATE tracks SET decision = 'kept', decided_at = COALESCE(decided_at, created_at) WHERE shortlisted = 1 AND decision IS NULL");
}

export function db(): DatabaseSync {
  const g = globalThis as G;
  if (!g.__floortestDb) g.__floortestDb = open();
  if (g.__floortestSchema !== SCHEMA_VERSION) {
    migrate(g.__floortestDb);
    g.__floortestSchema = SCHEMA_VERSION;
  }
  return g.__floortestDb;
}

export const now = () => Date.now();

export function tx<T>(fn: () => T): T {
  const d = db();
  d.exec("BEGIN");
  try {
    const r = fn();
    d.exec("COMMIT");
    return r;
  } catch (e) {
    d.exec("ROLLBACK");
    throw e;
  }
}

// Row types
export type User = {
  id: number;
  email: string;
  name: string;
  handle: string;
  plan: string;
  active_collection_id: number | null;
  role_line: string;
  cover_file: string | null;
  page_style: "classic" | "stage";
  paused_at: number | null;
  pause_until: number | null;
  pause_message: string;
  created_at: number;
};
export type Collection = {
  id: number;
  user_id: number;
  name: string;
  created_at: number;
  closes_at: number | null;
  brief_wanted: string;
  bpm_min: number | null;
  bpm_max: number | null;
  brief_note: string;
  genres: string;
};
export type Sender = {
  id: number;
  user_id: number;
  email: string;
  name: string;
  created_at: number;
  verified_at: number | null;
  verify_token: string | null;
  blocked_at: number | null;
};
export type Decision = "kept" | "passed";
export type Track = {
  id: number;
  user_id: number;
  collection_id: number | null;
  sender_id: number;
  token: string;
  title: string;
  artist: string;
  message: string;
  file_name: string | null;
  original_name: string;
  mime: string;
  size: number;
  duration: number | null;
  bpm: number | null;
  peaks: string | null;
  played_at: number | null;
  downloaded_at: number | null;
  shortlisted: number;
  decision: Decision | null;
  decided_at: number | null;
  release_status: string;
  mix_status: string;
  genre: string;
  replied_at: number | null;
  deleted_at: number | null;
  created_at: number;
};
export type EventRow = {
  id: number;
  user_id: number;
  sender_id: number;
  track_id: number | null;
  type: "submitted" | "played" | "downloaded" | "kept" | "passed" | "note" | "reply" | "deleted" | "expired" | "moved" | "blocked" | "unblocked";
  detail: string;
  created_at: number;
};

export function logEvent(e: Omit<EventRow, "id" | "created_at">) {
  const r = db()
    .prepare("INSERT INTO events (user_id, sender_id, track_id, type, detail, created_at) VALUES (?,?,?,?,?,?)")
    .run(e.user_id, e.sender_id, e.track_id, e.type, e.detail, now());
  return Number(r.lastInsertRowid);
}
