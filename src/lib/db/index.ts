import "server-only";
import { getDb, type Queryable } from "./client";

export { dataDir } from "./client";
export type { Queryable } from "./client";

/** App-wide query helpers. Every call is async; the connection is opened and migrated lazily. */
export const q = {
  async all<T>(sql: string, ...args: unknown[]) {
    return (await getDb()).all<T>(sql, ...args);
  },
  async get<T>(sql: string, ...args: unknown[]) {
    return (await getDb()).get<T>(sql, ...args);
  },
  async run(sql: string, ...args: unknown[]) {
    return (await getDb()).run(sql, ...args);
  },
  async tx<T>(fn: (q: Queryable) => Promise<T>) {
    return (await getDb()).tx(fn);
  },
  /** Scalar COUNT(*) helper. */
  async count(sql: string, ...args: unknown[]) {
    return (await (await getDb()).get<{ n: number }>(sql, ...args))?.n ?? 0;
  },
};

export const now = () => Date.now();

/** LIKE pattern for user input: escapes %, _ and \ so they match literally. */
export const likeContains = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

// Row types
export type User = {
  id: number;
  /** Who the account is for; null for accounts made before sign-up asked. */
  kind: "dj" | "producer" | "label" | null;
  email: string;
  name: string;
  handle: string;
  plan: string;
  active_collection_id: number | null;
  role_line: string;
  cover_key: string | null;
  page_style: "classic" | "stage";
  paused_at: number | null;
  pause_until: number | null;
  pause_message: string;
  tz: string;
  email_verified_at: number | null;
  totp_enabled_at: number | null;
  signin_alerts: number;
  identity_status: "none" | "pending" | "verified" | "rejected";
  created_at: number;
};

/** Columns that make up `User`. Never select password_hash into it. */
export const USER_COLUMNS =
  "id, email, name, handle, plan, active_collection_id, role_line, cover_key, page_style, paused_at, pause_until, pause_message, tz, email_verified_at, totp_enabled_at, signin_alerts, identity_status, created_at";

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
  allow_sharing: number;
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
  account_id: number | null;
};
export type Decision = "kept" | "passed";
export const isDecision = (v: unknown): v is Decision => v === "kept" || v === "passed";
export type Track = {
  id: number;
  user_id: number;
  collection_id: number | null;
  sender_id: number;
  token: string;
  title: string;
  artist: string;
  message: string;
  file_key: string | null;
  original_name: string;
  mime: string;
  size: number;
  duration: number | null;
  bpm: number | null;
  peaks: string | null;
  played_at: number | null;
  played_out_at: number | null;
  played_out_note: string;
  duplicate_of: number | null;
  nudged_at: number | null;
  downloaded_at: number | null;
  decision: Decision | null;
  decided_at: number | null;
  release_status: string;
  mix_status: string;
  genre: string;
  replied_at: number | null;
  receiver_notified_at: number | null;
  deleted_at: number | null;
  set_cleared_at: number | null;
  created_at: number;
  stems_requested_at: number | null;
  share_ok: number;
  energy: number | null;
  /** JSON: [{ at: seconds, label }] */
  cues: string;
  /** Colleagues may download: the receiver was on a paid plan and allowed sharing when this was sent. */
  share_download: number;
  /** Set when the track was sent as part of a folder. */
  batch_id: string | null;
  sets_ok: number;
};
export type EventRow = {
  id: number;
  user_id: number;
  sender_id: number;
  track_id: number | null;
  type: "submitted" | "played" | "downloaded" | "kept" | "passed" | "note" | "reply" | "deleted" | "expired" | "moved" | "blocked" | "unblocked" | "played_out" | "shared";
  detail: string;
  created_at: number;
};

export async function logEvent(e: Omit<EventRow, "id" | "created_at">, db: Queryable = q) {
  const r = await db.get<{ id: number }>(
    "INSERT INTO events (user_id, sender_id, track_id, type, detail, created_at) VALUES (?,?,?,?,?,?) RETURNING id",
    e.user_id,
    e.sender_id,
    e.track_id,
    e.type,
    e.detail,
    now(),
  );
  return r!.id;
}

/** Who an account is for, as asked at sign-up. */
export const KINDS = ["dj", "producer", "label"];
export const KIND_LABEL: Record<string, string> = { dj: "DJ / curator", producer: "Producer", label: "Label / A&R" };
