import "server-only";
import { q, type Queryable } from "./db";
import { APP_URL } from "./mail";

/**
 * The one place that knows how a receipt token is stored (link-page audit, 2 Nov). The token is the sender's only key to
 * their receipt, so every lookup and every link to it goes through here: finding a track by the token a visitor brings,
 * and building the receipt link we show or email. Today the token is stored as it is; storing it hashed changes only
 * this file. Callers keep their own columns and joins: `receiptWhere` gives the condition and its arguments.
 */

/** Longest token we look up: longer input is cut, never searched for whole. */
const MAX_TOKEN = 100;

/** The WHERE condition matching a receipt token, for a query whose tracks table is `alias` (or unaliased with ""). */
export function receiptWhere(token: string, alias = "t") {
  const col = alias ? `${alias}.token` : "token";
  return { sql: `${col} = ?`, args: [String(token).slice(0, MAX_TOKEN)] as unknown[] };
}

/** The track a receipt token belongs to, by id, or undefined. Deleted tracks are found too; callers decide. */
export async function findByReceiptToken(token: string, db: Queryable = q) {
  const m = receiptWhere(token, "t");
  return db.get<{ id: number }>(`SELECT t.id FROM tracks t WHERE ${m.sql}`, ...m.args);
}

/** The receipt's path (`/receipt/<token>`), for links on our own pages. */
export const receiptPath = (track: { token: string }) => `/receipt/${track.token}`;

/** The receipt's full link, for emails. */
export const receiptUrl = (track: { token: string }) => `${APP_URL}${receiptPath(track)}`;
