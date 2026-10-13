import "server-only";
import crypto from "node:crypto";
import { now, q } from "./db";
import { APP_URL, sendMail } from "./mail";

/**
 * Newsletter for people without an account. Double opt-in: nothing is sent except the confirmation email until
 * they click it. Offers and promotions are a separate, optional consent. Every email carries a one-click
 * unsubscribe link built from the subscriber's own token.
 */
export async function subscribe(email: string, marketing: boolean, source: string) {
  const token = crypto.randomBytes(18).toString("base64url");
  const row = await q.get<{ token: string; confirmed_at: number | null; unsubscribed_at: number | null }>(
    `INSERT INTO newsletter_subscribers (email, token, marketing, source, created_at) VALUES (?,?,?,?,?)
     ON CONFLICT (email) DO UPDATE SET marketing = CASE WHEN newsletter_subscribers.confirmed_at IS NULL OR newsletter_subscribers.unsubscribed_at IS NOT NULL THEN excluded.marketing ELSE newsletter_subscribers.marketing END,
       token = CASE WHEN newsletter_subscribers.unsubscribed_at IS NOT NULL THEN excluded.token ELSE newsletter_subscribers.token END,
       confirmed_at = CASE WHEN newsletter_subscribers.unsubscribed_at IS NOT NULL THEN NULL ELSE newsletter_subscribers.confirmed_at END,
       unsubscribed_at = NULL
     RETURNING token, confirmed_at, unsubscribed_at`,
    email, token, marketing ? 1 : 0, source, now(),
  );
  if (!row || row.confirmed_at) return; // already confirmed: say nothing new, reveal nothing
  await sendMail({
    userId: null,
    audience: "support",
    to: email,
    secrets: [row.token],
    subject: "Confirm your FloorTest newsletter sign-up",
    body: [
      "Hi,",
      "",
      "Someone (hopefully you) asked to get the FloorTest newsletter at this address. Confirm here:",
      `${APP_URL}/newsletter/confirm/${row.token}`,
      "",
      "If it wasn't you, ignore this email and you won't hear from us again.",
      "",
      "— FloorTest",
    ].join("\n"),
  });
}

export async function confirmSubscription(token: string) {
  const r = await q.run("UPDATE newsletter_subscribers SET confirmed_at = COALESCE(confirmed_at, ?) WHERE token = ? AND unsubscribed_at IS NULL", now(), token);
  return r.changes > 0;
}

export async function unsubscribeNewsletter(token: string) {
  const r = await q.run("UPDATE newsletter_subscribers SET unsubscribed_at = COALESCE(unsubscribed_at, ?) WHERE token = ?", now(), token);
  return r.changes > 0;
}

/** Footer line for every newsletter email to a non-account subscriber. */
export const newsletterFooter = (token: string) => `You get this because you signed up for the FloorTest newsletter. Unsubscribe: ${APP_URL}/newsletter/unsubscribe/${token}`;
