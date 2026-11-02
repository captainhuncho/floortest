import crypto from "node:crypto";
import { normalEmail } from "./email-normal";

/**
 * Proof that the person looking at a receipt is its sender (owner, 2 Nov, Option B; Safety's conditions). With the
 * link alone a receipt shows only what happened and when; the track, receiver and note need one of:
 *   (a) this browser's `ft_receipt` cookie naming the receipt's sender, set when the track was sent from here, or
 *   (b) the signed-in FloorTest account the sender sent from, or
 *   (c) a 6-digit code emailed to the sender's address, after which (a) is set for 30 days.
 * The cookie is signed with APP_SECRET and lists sender ids, each bound to a hash of that sender's email at the time,
 * so another sender's cookie opens nothing and changing or erasing the sender's email ends it. No server imports:
 * this part is pure, so the unit tests can drive it directly (src/lib/receipt-proof.ts reads the request).
 */
export const RECEIPT_COOKIE = "ft_receipt";
export const RECEIPT_REMEMBER_MS = 30 * 24 * 3_600_000;
/** Senders kept in one browser's cookie: one per receiver someone sent to from here. Oldest drop off first. */
export const MAX_SENDERS = 20;

export type ProofEntry = { s: number; e: string; x: number };

const mac = (secret: string, body: string) => crypto.createHmac("sha256", secret).update(`receipt-proof:${body}`).digest("base64url");

/** The sender's current email as the cookie binds it: a keyed hash, so the cookie never carries the address. */
export const emailBinding = (secret: string, email: string) =>
  crypto.createHmac("sha256", secret).update(`receipt-email:${normalEmail(email)}`).digest("base64url").slice(0, 16);

/** The entries in a cookie value, or none if it's missing, malformed, unsigned or signed with another key. */
export function readProof(secret: string, value: string | undefined, at = Date.now()): ProofEntry[] {
  const [body, sig] = (value ?? "").split(".");
  if (!body || !sig) return [];
  const want = mac(secret, body);
  if (want.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(sig))) return [];
  try {
    const list = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!Array.isArray(list)) return [];
    return list.filter((p): p is ProofEntry => Number.isSafeInteger(p?.s) && typeof p?.e === "string" && Number.isFinite(p?.x) && p.x > at).slice(-MAX_SENDERS);
  } catch {
    return [];
  }
}

/** A cookie value with this sender added (or renewed), keeping the others still live. */
export function withSender(secret: string, value: string | undefined, senderId: number, email: string, at = Date.now()): string {
  const keep = readProof(secret, value, at).filter((p) => p.s !== senderId);
  const list = [...keep, { s: senderId, e: emailBinding(secret, email), x: at + RECEIPT_REMEMBER_MS }].slice(-MAX_SENDERS);
  const body = Buffer.from(JSON.stringify(list)).toString("base64url");
  return `${body}.${mac(secret, body)}`;
}

/** True when the cookie names this sender and was made for the email the sender has now. */
export function cookieProves(secret: string, value: string | undefined, sender: { id: number; email: string }, at = Date.now()) {
  const e = emailBinding(secret, sender.email);
  return readProof(secret, value, at).some((p) => p.s === sender.id && p.e === e);
}

/** The whole proof check: the signed-in account the sender sent from, or a cookie bound to this sender. */
export function proves(
  secret: string,
  receipt: { sender_id: number; sender_email: string; sender_account: number | null },
  visitor: { cookie: string | undefined; personId: number | null },
  at = Date.now(),
) {
  if (receipt.sender_account && visitor.personId === receipt.sender_account) return true;
  return cookieProves(secret, visitor.cookie, { id: receipt.sender_id, email: receipt.sender_email }, at);
}
