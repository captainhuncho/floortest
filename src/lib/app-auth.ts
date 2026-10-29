import "server-only";
import crypto from "node:crypto";
import { audit } from "./audit";
import { hashToken } from "./token-hash";
import { now, q, USER_COLUMNS, type User } from "./db";
import { env } from "./env";

/**
 * Sign-in for the mobile app (/api/v1). The phone never holds database or storage keys, only two tokens:
 * - a refresh token: random, stored hashed in the `sessions` table as kind 'app' (60 days, replaced on every use, and
 *   never past APP_SESSION_MAX_MS after the first sign-in), so "sign out everywhere", password changes and ops
 *   sign-outs end it like any browser session;
 * - an access token: signed, 15 minutes, bound to that session row, sent as `Authorization: Bearer …`.
 * Every request re-checks that the session still exists and the account isn't suspended, so revoking is immediate.
 */
const REFRESH_MS = 60 * 24 * 3_600_000;
/**
 * However often the app refreshes, a sign-in lasts at most this long; then the person signs in again. The first
 * sign-in time is carried from row to row in `created_at` on every refresh. Rows issued before this cap existed held
 * the time of their latest refresh there, so for those the 90 days count from that refresh (at most one extra
 * lifetime once, then the clock is carried like any other).
 */
export const APP_SESSION_MAX_MS = 90 * 24 * 3_600_000;
export const ACCESS_MS = 15 * 60_000;

const sign = (body: string) => crypto.createHmac("sha256", env.secret).update(`app-access:${body}`).digest("base64url");

function accessToken(userId: number, session: string, at = now()) {
  const body = `${userId}.${session}.${at + ACCESS_MS}`;
  return `${body}.${sign(body)}`;
}

/** Starts an app session after a successful sign-in (or carries one on: `signedInAt` is when that sign-in was). */
export async function issueAppSession(userId: number, label: string, signedInAt = now()) {
  const t = now();
  const refresh = crypto.randomBytes(32).toString("base64url");
  const session = hashToken(refresh);
  const expires = Math.min(t + REFRESH_MS, signedInAt + APP_SESSION_MAX_MS);
  await q.run(
    "INSERT INTO sessions (token_hash, user_id, expires_at, created_at, kind, label, last_seen_at) VALUES (?,?,?,?,?,?,?)",
    session, userId, expires, signedInAt, "app", label.slice(0, 80), t,
  );
  return { accessToken: accessToken(userId, session), refreshToken: refresh, expiresIn: ACCESS_MS / 1000 };
}

/**
 * Swaps a refresh token for new ones (the old one stops working). Null if it's unknown, expired, revoked or the sign-in
 * is older than APP_SESSION_MAX_MS (the old row is removed either way).
 */
export async function refreshAppSession(refresh: string) {
  const old = await q.get<{ user_id: number; label: string; created_at: number }>(
    "DELETE FROM sessions WHERE token_hash = ? AND kind = 'app' AND expires_at > ? RETURNING user_id, label, created_at",
    hashToken(String(refresh).slice(0, 200)), now(),
  );
  if (!old) return null;
  const signedInAt = Number(old.created_at);
  if (!(now() - signedInAt < APP_SESSION_MAX_MS)) return null;
  const live = await q.get("SELECT 1 FROM users WHERE id = ? AND suspended_at IS NULL", old.user_id);
  return live ? issueAppSession(old.user_id, old.label, signedInAt) : null;
}

/**
 * Sign out on this phone: ends the session the Bearer token belongs to (`session`), even when no refresh token is sent,
 * and the refresh token's session if it is the same account's. Another account's token is left alone.
 */
export async function endAppSession(refresh: string, userId: number, session: string) {
  const r = await q.run(
    "DELETE FROM sessions WHERE user_id = ? AND kind = 'app' AND token_hash IN (?, ?)",
    userId, session, hashToken(String(refresh).slice(0, 200)),
  );
  if (r.changes) await audit(userId, "signed_out", "app");
}

/** Reads `token` without touching the database: who and which session, if genuine and unexpired. */
export function readAccessToken(token: string | null | undefined, at = now()) {
  const [id, session, exp, sig] = String(token ?? "").split(".");
  const userId = Number(id);
  if (!userId || !/^[a-f0-9]{64}$/.test(session ?? "") || !(Number(exp) > at) || !sig) return null;
  const want = Buffer.from(sign(`${id}.${session}.${exp}`));
  const got = Buffer.from(sig);
  return got.length === want.length && crypto.timingSafeEqual(got, want) ? { userId, session } : null;
}

/** The account behind a request's Bearer token, if that app session is still live. The app always works the person's
 * own desk, so they are its owner and the one acting (as `currentUser()` gives for your own desk on the web). */
export async function appUser(req: Request): Promise<User | null> {
  const t = readAccessToken(req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""));
  if (!t) return null;
  const cols = USER_COLUMNS.split(", ").map((c) => `u.${c}`).join(", ");
  const u = await q.get<Omit<User, "actor_id" | "actor_name" | "role">>(
    `SELECT ${cols} FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.user_id = ? AND s.kind = 'app' AND s.expires_at > ? AND u.suspended_at IS NULL`,
    t.session, t.userId, now(),
  );
  return u ? { ...u, actor_id: u.id, actor_name: u.name, role: "owner" } : null;
}
