import "server-only";
import crypto from "node:crypto";
import { q, type Queryable } from "./db";
import { env } from "./env";
import { APP_URL } from "./mail";
import { hashToken } from "./token-hash";

/**
 * The one place that knows how a receipt token is stored (link-page audit, 2 Nov; design reviewed by Safety). The token
 * is the sender's only key to their receipt, so every lookup and every link to it goes through here.
 *
 * Stored as `token_hash` (its SHA-256, src/lib/token-hash.ts) to find the receipt, and `token_sealed` (AES-256-GCM with a
 * key from APP_SECRET, the track id bound in) so the server can rebuild the link for later emails and /sent. Lookups and
 * links already use these. The plain `token` is still written and kept for one release (Safety, 2 Nov): the owner's
 * "roll back" puts back the previous build, which reads only `token`. The next release clears it and drops the plain
 * lookup; after that a copy of the database (a backup, an ops query) holds nothing that opens a receipt.
 * If APP_SECRET changes, sealed copies can't be opened: lookups still work, and links in new emails become /sent.
 */

/** Longest token we look up: longer input is cut, never searched for whole. */
const MAX_TOKEN = 100;

/** What a link needs from a track row: its id, and the plain token (old rows, or just made) or the sealed one. */
export type ReceiptKey = { id: number; token?: string | null; token_sealed?: string | null };

const keyFrom = () => crypto.createHash("sha256").update(`floortest-receipt:${env.secret}`).digest();

/** The token sealed for one track: a fresh IV each time, the track id as associated data, so it can't be moved to another row. */
export function sealReceiptToken(token: string, trackId: number) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", keyFrom(), iv);
  c.setAAD(Buffer.from(String(trackId)));
  const body = Buffer.concat([c.update(token, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}

/** The plain token, or null if it can't be opened (another row's copy, a changed APP_SECRET). Never logs the token. */
export function openReceiptToken(sealed: string, trackId: number): string | null {
  try {
    const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
    const d = crypto.createDecipheriv("aes-256-gcm", keyFrom(), iv);
    d.setAAD(Buffer.from(String(trackId)));
    d.setAuthTag(tag);
    return Buffer.concat([d.update(body), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** A new receipt token: 96 random bits. */
export const newReceiptToken = () => crypto.randomBytes(12).toString("base64url");

/** The plain token for building a link or hiding it in an email's stored copy, or null when it can't be had. */
export function receiptToken(track: ReceiptKey): string | null {
  if (track.token) return track.token;
  return track.token_sealed ? openReceiptToken(track.token_sealed, track.id) : null;
}

/**
 * The WHERE condition matching a receipt token, for a query whose tracks table is `alias` (or unaliased with ""). The
 * hash, plus the plain column while old rows still have it (that part goes once none is left).
 */
export function receiptWhere(token: string, alias = "t") {
  const cut = String(token).slice(0, MAX_TOKEN);
  const col = (c: string) => (alias ? `${alias}.${c}` : c);
  return { sql: `(${col("token_hash")} = ? OR ${col("token")} = ?)`, args: [hashToken(cut), cut] as unknown[] };
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

/** Adds the hash and sealed copy for a track's token (the plain one stays this release). For a new track, in its transaction. */
export async function storeReceiptToken(db: Queryable, trackId: number, token: string) {
  await db.run("UPDATE tracks SET token_hash = ?, token_sealed = ? WHERE id = ?", hashToken(token), sealReceiptToken(token, trackId), trackId);
}

/**
 * Seals one old row: its sealed copy added once, and only where the row's hash is this token's. A hash that's there is
 * never rewritten (Safety, 4 Nov): after a backup restore `token` holds a random stand-in (src/lib/backup.ts), and
 * hashing that would break the receipt link the real hash still opens. A missing hash (a row the build before 0126 wrote
 * during a deploy) is filled from the token, which is then the real one.
 */
export async function sealOldReceipt(trackId: number, token: string, db: Queryable = q) {
  const r = await db.run(
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
export async function sealOldReceipts(limit = 2000, db: Queryable = q) {
  const unsealed = "token IS NOT NULL AND token_sealed IS NULL";
  const rows = await db.all<{ id: number; token: string }>(`SELECT id, token FROM tracks WHERE ${unsealed} AND ${PLAIN_IS_REAL} ORDER BY id LIMIT ?`, limit);
  let sealed = 0;
  for (const r of rows) if (await sealOldReceipt(r.id, r.token, db)) sealed++;
  const count = async (where: string) => Number((await db.get<{ n: number }>(`SELECT COUNT(*)::int AS n FROM tracks WHERE ${where}`))?.n ?? 0);
  const left = await count(`${unsealed} AND ${PLAIN_IS_REAL}`);
  const standIns = await count(`${unsealed} AND NOT (${PLAIN_IS_REAL})`);
  return { receiptsSealed: sealed, receiptsUnsealedLeft: left, receiptsRestoredStandIns: standIns };
}
