import "server-only";
import crypto from "node:crypto";
import { q } from "./db";
import { env } from "./env";
import { normalEmail } from "./email-normal";

/** Kinds of optional email a person can switch off from the email itself, without signing in. */
export const UNSUB_KINDS = {
  submissions: { label: "new-track emails and digests", sql: "UPDATE users SET notify_submissions = 'off' WHERE id = ?" },
  alerts: { label: "reminders and desk alerts", sql: "UPDATE users SET notify_alerts = 0 WHERE id = ?" },
  product: { label: "the newsletter", sql: "UPDATE users SET notify_product = 0, product_consent_at = NULL WHERE id = ?" },
  marketing: { label: "offers and promotions", sql: "UPDATE users SET notify_marketing = 0, marketing_consent_at = NULL WHERE id = ?" },
} as const;
export type UnsubKind = keyof typeof UNSUB_KINDS;

const sign = (payload: string) => crypto.createHmac("sha256", env.secret).update(`unsub:${payload}`).digest("base64url").slice(0, 22);

const emailTag = (email: string) => crypto.createHash("sha256").update(normalEmail(email)).digest("base64url").slice(0, 8);

/**
 * A link token that can only switch off one kind of email for one account, at the address it was sent to.
 * It stops working if the account's email changes (an old mailbox can't change the new owner's settings),
 * and if APP_SECRET is rotated. Otherwise it never expires; it's harmless if shared.
 */
export function unsubToken(userId: number, kind: UnsubKind, email: string) {
  const payload = `${userId}.${kind}.${emailTag(email)}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

function readUnsubToken(token: string): { userId: number; kind: UnsubKind; tag: string } | null {
  const [p, mac] = token.slice(0, 200).split(".");
  if (!p || !mac) return null;
  const payload = Buffer.from(p, "base64url").toString();
  const expected = sign(payload);
  const got = Buffer.from(mac);
  const want = Buffer.from(expected);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
  const [id, kind, tag] = payload.split(".");
  if (!(kind in UNSUB_KINDS) || !/^\d+$/.test(id) || !tag) return null;
  return { userId: Number(id), kind: kind as UnsubKind, tag };
}

/** The token, if it's genuine and still matches the account's current email. */
export async function checkUnsubToken(token: string) {
  const t = readUnsubToken(token);
  if (!t) return null;
  const u = await q.get<{ email: string }>("SELECT email FROM users WHERE id = ?", t.userId);
  return u && emailTag(u.email) === t.tag ? { userId: t.userId, kind: t.kind } : null;
}

export async function applyUnsubscribe(token: string) {
  const t = await checkUnsubToken(token);
  if (!t) return null;
  await q.run(UNSUB_KINDS[t.kind].sql, t.userId);
  return t;
}
