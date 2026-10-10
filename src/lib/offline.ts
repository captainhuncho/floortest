import "server-only";
import crypto from "node:crypto";
import { env } from "@/lib/env";

/**
 * Offline kept tracks (phone apps): the app downloads each kept track through a short-lived signed link, because the
 * phone's downloader doesn't carry the browser's sign-in. A link names one track and one receiver and lasts an hour.
 */
export const OFFLINE_LINK_MS = 3_600_000;
/** Saved copies are wiped if the phone hasn't checked in with Prepare for this long (the apps enforce it). */
export const OFFLINE_MAX_DAYS = 30;

const sign = (body: string) => crypto.createHmac("sha256", env.secret).update(`offline:${body}`).digest("base64url");

export function offlineToken(trackId: number, userId: number, at = Date.now()) {
  const body = `${trackId}.${userId}.${at + OFFLINE_LINK_MS}`;
  return `${body}.${sign(body)}`;
}

export function readOfflineToken(token: string, at = Date.now()): { trackId: number; userId: number } | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [t, u, exp, sig] = parts;
  const expected = sign(`${t}.${u}.${exp}`);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (!(Number(exp) > at)) return null;
  const trackId = Number(t);
  const userId = Number(u);
  return Number.isSafeInteger(trackId) && Number.isSafeInteger(userId) ? { trackId, userId } : null;
}
