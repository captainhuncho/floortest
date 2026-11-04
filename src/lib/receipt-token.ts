import "server-only";
import crypto from "node:crypto";
import { q, type Queryable } from "./db";
import { env } from "./env";
import { APP_URL } from "./mail";
import { openWith, sealWith } from "./receipt-seal";
import { hashToken } from "./token-hash";

/**
 * The one place that knows how a receipt token is stored (link-page audit, 2 Nov; design reviewed by Safety). The token
 * is the sender's only key to their receipt, so every lookup and every link to it goes through here.
 *
 * Stored as `token_hash` (its SHA-256, src/lib/token-hash.ts) to find the receipt, and `token_sealed` (AES-256-GCM with a
 * key from APP_SECRET, the track id bound in) so the server can rebuild the link for later emails and /sent. The plain
 * `tracks.token` is no longer written or read (migration 0127 cleared it, plan B11): a copy of the database (a backup,
 * an ops query) holds nothing that opens a receipt. A just-made track carries its token in memory only.
 * If APP_SECRET changes, sealed copies can't be opened: lookups still work, and links in new emails become /sent.
 */

/** Longest token we look up: longer input is cut, never searched for whole. */
const MAX_TOKEN = 100;

/** What a link needs from a track row: its id and sealed copy (or, for a track just made, its token in memory). */
export type ReceiptKey = { id: number; token?: string | null; token_hash?: string | null; token_sealed?: string | null };

/** The token sealed for one track: a fresh IV each time, the track id as associated data, so it can't be moved to another row. */
export const sealReceiptToken = (token: string, trackId: number) => sealWith(token, trackId, env.secret);

/** The plain token, or null if it can't be opened (another row's copy, a changed APP_SECRET). Never logs the token. */
export const openReceiptToken = (sealed: string, trackId: number): string | null => openWith(sealed, trackId, env.secret);

/** A new receipt token: 96 random bits. */
export const newReceiptToken = () => crypto.randomBytes(12).toString("base64url");

/** The plain token for building a link or hiding it in an email's stored copy, or null when it can't be had. */
export function receiptToken(track: ReceiptKey): string | null {
  // The plain token only when it's the row's own: after a backup restore it holds a random stand-in whose hash isn't
  // the row's, and a link built from that wouldn't open (Safety, 4 Nov). A just-made track has no hash in memory yet.
  if (track.token && (track.token_hash == null || hashToken(track.token) === track.token_hash)) return track.token;
  return track.token_sealed ? openReceiptToken(track.token_sealed, track.id) : null;
}

/** The WHERE condition matching a receipt token, for a query whose tracks table is `alias` (or unaliased with ""). */
export function receiptWhere(token: string, alias = "t") {
  const col = alias ? `${alias}.token_hash` : "token_hash";
  return { sql: `${col} = ?`, args: [hashToken(String(token).slice(0, MAX_TOKEN))] as unknown[] };
}

/** The track a receipt token belongs to, by id, or undefined. Deleted tracks are found too; callers decide. */
export async function findByReceiptToken(token: string, db: Queryable = q) {
  const m = receiptWhere(token, "t");
  return db.get<{ id: number }>(`SELECT t.id FROM tracks t WHERE ${m.sql}`, ...m.args);
}

/** The receipt's path (`/receipt/<token>`) for links on our own pages; /sent when the token can't be had. */
export const receiptPath = (track: ReceiptKey) => {
  const token = receiptToken(track);
  return token ? `/receipt/${token}` : "/sent";
};

/** The path of the receipt a visitor opened, from the token in its own address (to refresh that page). */
export const receiptPathForToken = (token: string) => `/receipt/${String(token).slice(0, MAX_TOKEN)}`;

/** The receipt's full link, for emails. */
export const receiptUrl = (track: ReceiptKey) => `${APP_URL}${receiptPath(track)}`;

/** Stores a new track's token as its hash and sealed copy (never in plain). In the track's own transaction. */
export async function storeReceiptToken(db: Queryable, trackId: number, token: string) {
  await db.run("UPDATE tracks SET token_hash = ?, token_sealed = ? WHERE id = ?", hashToken(token), sealReceiptToken(token, trackId), trackId);
}

/**
 * Seals one old row: its sealed copy added once, and only where the row's hash is this token's. A hash that's there is
 * never rewritten (Safety, 4 Nov): after a backup restore `token` holds a random stand-in (src/lib/backup.ts), and
 * hashing that would break the receipt link the real hash still opens. A missing hash (a row the build before 0126 wrote
 * during a deploy) is filled from the token, which is then the real one.
 */
export async function sealOldReceipt(trackId: number, token: string) {
  const r = await q.run(
    "UPDATE tracks SET token_hash = COALESCE(token_hash, ?), token_sealed = ? WHERE id = ? AND token = ? AND token_sealed IS NULL AND (token_hash IS NULL OR token_hash = ?)",
    hashToken(token), sealReceiptToken(token, trackId), trackId, token, hashToken(token),
  );
  return r.changes > 0;
}

/** The same hash as hashToken, in SQL, so the batch picks only rows whose plain token is still the real one. */
const PLAIN_IS_REAL = "(token_hash IS NULL OR token_hash = encode(sha256(convert_to(token, 'UTF8')), 'hex'))";

/**
 * The nightly batch: seals up to `limit` old rows; returns how many, how many real ones are still unsealed, and how
 * many hold a token that isn't theirs (a restored stand-in: never sealed, their hash keeps working).
 */
export async function sealOldReceipts(limit = 2000) {
  const unsealed = "token IS NOT NULL AND token_sealed IS NULL";
  const rows = await q.all<{ id: number; token: string }>(`SELECT id, token FROM tracks WHERE ${unsealed} AND ${PLAIN_IS_REAL} ORDER BY id LIMIT ?`, limit);
  let sealed = 0;
  for (const r of rows) if (await sealOldReceipt(r.id, r.token)) sealed++;
  const left = await q.count(`SELECT COUNT(*) AS n FROM tracks WHERE ${unsealed} AND ${PLAIN_IS_REAL}`);
  const standIns = await q.count(`SELECT COUNT(*) AS n FROM tracks WHERE ${unsealed} AND NOT (${PLAIN_IS_REAL})`);
  return { receiptsSealed: sealed, receiptsUnsealedLeft: left, receiptsRestoredStandIns: standIns };
}
