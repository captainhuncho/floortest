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
 * key from APP_SECRET, the track id bound in) so the server can rebuild the link for later emails and /sent. A copy of
 * the database (a backup, an ops query) holds nothing that opens a receipt. Rows from before migration 0126 still have
 * the plain `token` until they're sealed (nightly, and on first read); lookups accept both until none is left.
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

/** Stores a track's token the new way (hash and sealed copy, no plain token). For a track just made, in its transaction. */
export async function storeReceiptToken(db: Queryable, trackId: number, token: string) {
  await db.run("UPDATE tracks SET token_hash = ?, token_sealed = ?, token = NULL WHERE id = ?", hashToken(token), sealReceiptToken(token, trackId), trackId);
}

/**
 * Seals one old row's plain token, then clears it, each step guarded so it happens once and never leaves a row with
 * neither: the plain column is cleared only where it still holds this token and both new columns are filled.
 */
export async function sealOldReceipt(trackId: number, token: string) {
  return q.tx(async (t) => {
    await t.run(
      "UPDATE tracks SET token_hash = ?, token_sealed = COALESCE(token_sealed, ?) WHERE id = ? AND token = ?",
      hashToken(token), sealReceiptToken(token, trackId), trackId, token,
    );
    return (await t.run("UPDATE tracks SET token = NULL WHERE id = ? AND token = ? AND token_sealed IS NOT NULL AND token_hash IS NOT NULL", trackId, token)).changes > 0;
  });
}

/** The nightly batch: seals up to `limit` old rows; returns how many, and how many still have a plain token. */
export async function sealOldReceipts(limit = 2000) {
  const rows = await q.all<{ id: number; token: string }>("SELECT id, token FROM tracks WHERE token IS NOT NULL ORDER BY id LIMIT ?", limit);
  let sealed = 0;
  for (const r of rows) if (await sealOldReceipt(r.id, r.token)) sealed++;
  const left = await q.count("SELECT COUNT(*) AS n FROM tracks WHERE token IS NOT NULL");
  return { receiptsSealed: sealed, receiptsPlainLeft: left };
}
