import "server-only";
import crypto from "node:crypto";
import { audit } from "./audit";
import { hashToken } from "./auth";
import { now, q, USER_COLUMNS, type User } from "./db";
import { env } from "./env";

/**
 * Sign-in for the mobile app (/api/v1). The phone never holds database or storage keys, only two tokens:
 * - a refresh token: random, stored hashed in the `sessions` table as kind 'app' (60 days, replaced on every use), so
 *   "sign out everywhere", password changes and ops sign-outs end it like any browser session;
 * - an access token: signed, 15 minutes, bound to that session row, sent as `Authorization: Bearer …`.
 * Every request re-checks that the session still exists and the account isn't suspended, so revoking is immediate.
 */
const REFRESH_MS = 60 * 24 * 3_600_000;
export const ACCESS_MS = 15 * 60_000;

const sign = (body: string) => crypto.createHmac("sha256", env.secret).update(`app-access:${body}`).digest("base64url");

function accessToken(userId: number, session: string, at = now()) {
  const body = `${userId}.${session}.${at + ACCESS_MS}`;
  return `${body}.${sign(body)}`;
}

/** Starts an app session after a successful sign-in. */
export async function issueAppSession(userId: number, label: string) {
  const refresh = crypto.randomBytes(32).toString("base64url");
  const session = hashToken(refresh);
  await q.run("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, kind, label) VALUES (?,?,?,?,?,?)", session, userId, now() + REFRESH_MS, now(), "app", label.slice(0, 80));
  return { accessToken: accessToken(userId, session), refreshToken: refresh, expiresIn: ACCESS_MS / 1000 };
}

/** Swaps a refresh token for new ones (the old one stops working). Null if it's unknown, expired or revoked. */
export async function refreshAppSession(refresh: string) {
  const old = await q.get<{ user_id: number; label: string }>(
    "DELETE FROM sessions WHERE token_hash = ? AND kind = 'app' AND expires_at > ? RETURNING user_id, label",
    hashToken(String(refresh).slice(0, 200)), now(),
  );
  if (!old) return null;
  const live = await q.get("SELECT 1 FROM users WHERE id = ? AND suspended_at IS NULL", old.user_id);
  return live ? issueAppSession(old.user_id, old.label) : null;
}

/** Ends one app session (sign out on this phone). */
export async function endAppSession(refresh: string, userId: number) {
  const r = await q.run("DELETE FROM sessions WHERE token_hash = ? AND kind = 'app'", hashToken(String(refresh).slice(0, 200)));
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

/** The account behind a request's Bearer token, if that app session is still live. */
export async function appUser(req: Request): Promise<User | null> {
  const t = readAccessToken(req.headers.get("authorization")?.replace(/^Bearer\s+/i, ""));
  if (!t) return null;
  const cols = USER_COLUMNS.split(", ").map((c) => `u.${c}`).join(", ");
  return (
    (await q.get<User>(
      `SELECT ${cols} FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.user_id = ? AND s.kind = 'app' AND s.expires_at > ? AND u.suspended_at IS NULL`,
      t.session, t.userId, now(),
    )) ?? null
  );
}
