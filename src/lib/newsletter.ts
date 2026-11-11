import "server-only";
import crypto from "node:crypto";
import { now, q } from "./db";
import { env } from "./env";
import { afterResponse, APP_URL, sendMail } from "./mail";
import { hashToken } from "./token-hash";

/**
 * Newsletter for people without an account. Double opt-in: nothing is sent except the confirmation email until
 * they click it. Offers and promotions are a separate, optional consent. Every email carries a one-click
 * unsubscribe link signed for that subscriber (newsletterUnsubToken).
 *
 * The confirmation token is stored only as its SHA-256 (`token_hash`; for a new sign-up the `token` column holds the
 * same hash), so a copy of the database holds no working link (owner, 11 Nov). Rows from before migration 0140 still
 * hold the plain token until the follow-up clears it; a row an older build writes during a deploy has no hash yet and
 * is found by its plain token.
 */
const byToken = (token: string) => ({ sql: "(token_hash = ? OR (token_hash IS NULL AND token = ?))", args: [hashToken(token), token] as unknown[] });

export async function subscribe(email: string, marketing: boolean, source: string) {
  const token = crypto.randomBytes(18).toString("base64url");
  const hash = hashToken(token);
  // Not yet confirmed (or unsubscribed): a new token, since the old one can't be read back to send again.
  const fresh = "newsletter_subscribers.confirmed_at IS NULL OR newsletter_subscribers.unsubscribed_at IS NOT NULL";
  const row = await q.get<{ confirmed_at: number | null }>(
    `INSERT INTO newsletter_subscribers (email, token, token_hash, marketing, source, created_at) VALUES (?,?,?,?,?,?)
     ON CONFLICT (email) DO UPDATE SET marketing = CASE WHEN ${fresh} THEN excluded.marketing ELSE newsletter_subscribers.marketing END,
       token = CASE WHEN ${fresh} THEN excluded.token ELSE newsletter_subscribers.token END,
       token_hash = CASE WHEN ${fresh} THEN excluded.token_hash ELSE newsletter_subscribers.token_hash END,
       confirmed_at = CASE WHEN newsletter_subscribers.unsubscribed_at IS NOT NULL THEN NULL ELSE newsletter_subscribers.confirmed_at END,
       unsubscribed_at = NULL
     RETURNING confirmed_at`,
    email, hash, hash, marketing ? 1 : 0, source, now(),
  );
  if (!row || row.confirmed_at) return; // already confirmed: say nothing new, reveal nothing
  await sendMail({
    userId: null,
    audience: "support",
    to: email,
    secrets: [token],
    subject: "Confirm your FloorTest newsletter sign-up",
    body: [
      "Hi,",
      "",
      "Someone (hopefully you) asked to get the FloorTest newsletter at this address. Confirm here:",
      `${APP_URL}/newsletter/confirm/${token}`,
      "",
      "If it wasn't you, ignore this email and you won't hear from us again.",
      "",
      "— FloorTest",
    ].join("\n"),
  });
}

/**
 * The footer form's sign-up, run after the response: a new address gets a confirmation email and a confirmed one gets
 * nothing, so doing it later keeps the answer's timing from saying which it was.
 */
export function subscribeLater(email: string, marketing: boolean, source: string) {
  afterResponse(() => subscribe(email, marketing, source), "[newsletter] sign-up failed");
}

export async function confirmSubscription(token: string) {
  const m = byToken(token);
  const r = await q.run(`UPDATE newsletter_subscribers SET confirmed_at = COALESCE(confirmed_at, ?) WHERE ${m.sql} AND unsubscribed_at IS NULL`, now(), ...m.args);
  return r.changes > 0;
}

const unsubMac = (id: number, email: string) =>
  crypto.createHmac("sha256", env.secret).update(`newsletter-unsub:${id}:${email}`).digest("base64url").slice(0, 22);

/**
 * The unsubscribe link's token for one subscriber: `n<id>.<signature>`, signed with APP_SECRET over the id and the
 * address, so nothing has to be stored and it only ever unsubscribes that address. Rotating APP_SECRET ends old links.
 */
export const newsletterUnsubToken = (sub: { id: number; email: string }) => `n${sub.id}.${unsubMac(sub.id, sub.email)}`;

/** Unsubscribes by a signed link (newsletterUnsubToken) or, for emails sent before 0140, the subscriber's own token. */
export async function unsubscribeNewsletter(token: string) {
  const signed = /^n(\d{1,15})\.([\w-]{22})$/.exec(token);
  if (signed) {
    const id = Number(signed[1]);
    const sub = await q.get<{ email: string }>("SELECT email FROM newsletter_subscribers WHERE id = ?", id);
    const want = Buffer.from(sub ? unsubMac(id, sub.email) : "x".repeat(22));
    if (!sub || !crypto.timingSafeEqual(Buffer.from(signed[2]), want)) return false;
    const r = await q.run("UPDATE newsletter_subscribers SET unsubscribed_at = COALESCE(unsubscribed_at, ?) WHERE id = ?", now(), id);
    return r.changes > 0;
  }
  const m = byToken(token);
  const r = await q.run(`UPDATE newsletter_subscribers SET unsubscribed_at = COALESCE(unsubscribed_at, ?) WHERE ${m.sql}`, now(), ...m.args);
  return r.changes > 0;
}

/** Footer line for every newsletter email to a non-account subscriber. */
export const newsletterFooter = (sub: { id: number; email: string }) =>
  `You get this because you signed up for the FloorTest newsletter. Unsubscribe: ${APP_URL}/newsletter/unsubscribe/${newsletterUnsubToken(sub)}`;
