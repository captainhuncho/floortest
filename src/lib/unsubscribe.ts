import "server-only";
import crypto from "node:crypto";
import { q } from "./db";
import { env } from "./env";

/** Kinds of optional email a person can switch off from the email itself, without signing in. */
export const UNSUB_KINDS = {
  submissions: { label: "new-track emails and digests", sql: "UPDATE users SET notify_submissions = 'off' WHERE id = ?" },
  alerts: { label: "reminders and desk alerts", sql: "UPDATE users SET notify_alerts = 0 WHERE id = ?" },
  product: { label: "product news", sql: "UPDATE users SET notify_product = 0 WHERE id = ?" },
} as const;
export type UnsubKind = keyof typeof UNSUB_KINDS;

const sign = (payload: string) => crypto.createHmac("sha256", env.secret).update(`unsub:${payload}`).digest("base64url").slice(0, 22);

/** A link token that can only switch off one kind of email for one account. Never expires; harmless if shared. */
export function unsubToken(userId: number, kind: UnsubKind) {
  const payload = `${userId}.${kind}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function readUnsubToken(token: string): { userId: number; kind: UnsubKind } | null {
  const [p, mac] = token.slice(0, 200).split(".");
  if (!p || !mac) return null;
  const payload = Buffer.from(p, "base64url").toString();
  const expected = sign(payload);
  if (mac.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) return null;
  const [id, kind] = payload.split(".");
  if (!(kind in UNSUB_KINDS) || !/^\d+$/.test(id)) return null;
  return { userId: Number(id), kind: kind as UnsubKind };
}

export async function applyUnsubscribe(token: string) {
  const t = readUnsubToken(token);
  if (!t) return null;
  await q.run(UNSUB_KINDS[t.kind].sql, t.userId);
  return t;
}
