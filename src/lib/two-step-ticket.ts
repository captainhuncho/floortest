import "server-only";
import crypto from "node:crypto";
import { now, q } from "./db";
import { hashToken } from "./token-hash";

/** How long the second sign-in step waits after the first (password, email code, reset link or Google). */
export const TICKET_MS = 5 * 60_000;

/**
 * The "first step passed, now the code" ticket between the two sign-in steps on a two-factor account. The cookie holds
 * a random id; only its hash is stored, for TICKET_MS. Finishing the second step deletes it, so a copied cookie can't be
 * replayed afterwards (passkey_challenges works the same way). The per-account twofa_fail limit still caps guessing.
 */
export async function issueTicket(userId: number) {
  const id = crypto.randomBytes(32).toString("base64url");
  await q.run("INSERT INTO two_step_tickets (id_hash, user_id, expires_at) VALUES (?,?,?)", hashToken(id), userId, now() + TICKET_MS);
  return id;
}

/** Whose sign-in a ticket from the cookie is waiting for, if it is live. Doesn't use it up. */
export async function ticketUser(id: string | undefined): Promise<number | null> {
  if (!id || id.length > 100) return null;
  const row = await q.get<{ user_id: number }>("SELECT user_id FROM two_step_tickets WHERE id_hash = ? AND expires_at > ?", hashToken(id), now());
  return row ? Number(row.user_id) : null;
}

/** Uses the ticket up once the second step passed. False if it was already used or expired, so only one request wins. */
export async function spendTicket(id: string | undefined, userId: number) {
  if (!id || id.length > 100) return false;
  const r = await q.run("DELETE FROM two_step_tickets WHERE id_hash = ? AND user_id = ? AND expires_at > ?", hashToken(id), userId, now());
  return r.changes > 0;
}
