import { after } from "next/server";
import { atLeast, roleOn, teamsOn, type TeamRole } from "./account-members";
import "server-only";
import crypto from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { now, q, USER_COLUMNS, type User } from "./db";
import { env, isProd } from "./env";
import { opsSessionLive } from "./ops";
import { GATE_COOKIE, GATE_DAYS, gatePassword, gateToken } from "./site-gate";
import { deviceLabel } from "./device-label";
import { OLD_SESSION_COOKIE, readSessionToken, sessionCookie, touchSession, WEB_IDLE_MS } from "./sessions";

/**
 * The session cookie (`__Host-` prefixed on the live site; names and the old-name cut-off in sessions.ts). The old
 * name is still read (never written) until 15 Nov 2026, so the change (15 Oct 2026) signed nobody out.
 */
const COOKIE = sessionCookie(isProd);
const OLD_COOKIE = OLD_SESSION_COOKIE;
const sessionToken = (jar: { get(name: string): { value: string } | undefined }) => readSessionToken(jar, isProd);
const SESSION_MS = 1000 * 60 * 60 * 24 * 30;

/** Tokens are stored hashed, so a database leak doesn't hand out live sessions or reset links. */
import { hashToken } from "./token-hash";
export { hashToken };
const newToken = () => crypto.randomBytes(32).toString("base64url");

import { hashPassword, needsRehash, verifyPassword } from "./password-hash";
export { hashPassword, needsRehash, verifyPassword };

/**
 * After a password is proven at sign-in, bring an older, cheaper hash up to today's cost (src/lib/password-hash.ts).
 * Only replaces the exact hash that was checked, so a password changed meanwhile is never overwritten. Never fails
 * the sign-in: an error here is logged and the old hash keeps working.
 */
export async function upgradePasswordHash(userId: number, password: string, stored: string) {
  if (!needsRehash(stored)) return;
  try {
    await q.run("UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ?", await hashPassword(password), userId, stored);
  } catch (e) {
    console.error("[auth] password hash upgrade failed", e);
  }
}

export async function createSession(userId: number) {
  const token = newToken();
  const expires = now() + SESSION_MS;
  // Which device, for the Security page's list and the sign-in alert; "last seen" starts now.
  const device = deviceLabel((await headers()).get("user-agent") ?? "");
  await q.run("INSERT INTO sessions (token_hash, user_id, expires_at, created_at, device, last_seen_at) VALUES (?,?,?,?,?,?)", hashToken(token), userId, expires, now(), device, now());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isProd,
    path: "/",
    expires: new Date(expires),
  });
  // While the site is behind the coming-soon gate, a real sign-in lets that browser through it.
  if (gatePassword())
    (await cookies()).set(GATE_COOKIE, gateToken(), { httpOnly: true, sameSite: "lax", secure: isProd, path: "/", maxAge: GATE_DAYS * 86_400 });
}

/** Hash of this browser's session token, or null when signed out. */
export async function currentSessionHash() {
  const token = sessionToken(await cookies());
  return token ? hashToken(token) : null;
}

export async function destroySession() {
  const jar = await cookies();
  const token = sessionToken(jar);
  if (token) await q.run("DELETE FROM sessions WHERE token_hash = ?", hashToken(token));
  jar.delete(COOKIE);
  if (COOKIE !== OLD_COOKIE) jar.delete(OLD_COOKIE);
}

export const VIEW_AS_COOKIE = "floortest_view_as";

/** Signed "admin X, from ops session S, is viewing user Y until T" ticket, readable only on /dashboard pages. */
export function signViewAs(adminId: number, userId: number, session: string, secret: string, ttlMs = 30 * 60_000) {
  const body = `${adminId}.${userId}.${session}.${Date.now() + ttlMs}`;
  return `${body}.${crypto.createHmac("sha256", secret).update(`viewas:${body}`).digest("base64url")}`;
}

function readViewAs(token: string | undefined, secret: string) {
  if (!token) return null;
  const [a, u, s, exp, mac] = token.split(".");
  if (!a || !u || !/^[a-f0-9]{64}$/.test(s ?? "") || !exp || !mac) return null;
  const want = crypto.createHmac("sha256", secret).update(`viewas:${a}.${u}.${s}.${exp}`).digest("base64url");
  if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac)) || Number(exp) < Date.now()) return null;
  return { adminId: Number(a), userId: Number(u), session: s };
}

/** When an admin is viewing someone's desk: who they're viewing. Null otherwise. */
export const viewingAs = cache(async (): Promise<{ adminId: number; userId: number; handle: string } | null> => {
  const jar = await cookies();
  const va = readViewAs(jar.get(VIEW_AS_COOKIE)?.value, env.secret);
  if (!va) return null;
  // That admin must still qualify (admin list, confirmed email, two-factor), and the exact ops session that opened
  // the view must still be live: signing out of ops ends it.
  const admin = await q.get<{ email: string; totp_enabled_at: number | null; email_verified_at: number | null }>(
    "SELECT email, totp_enabled_at, email_verified_at FROM users WHERE id = ? AND suspended_at IS NULL",
    va.adminId,
  );
  if (!admin || !admin.totp_enabled_at || !admin.email_verified_at || !env.adminEmails.includes(admin.email.toLowerCase())) return null;
  if (!(await opsSessionLive(va.session, va.adminId))) return null;
  const target = await q.get<{ handle: string }>("SELECT handle FROM users WHERE id = ?", va.userId);
  return target ? { adminId: va.adminId, userId: va.userId, handle: target.handle } : null;
});

/** Which desk a person who's on a team is working on (an account id). Unset or their own id: their own desk. */
export const DESK_COOKIE = "ft_desk";

/** Works on a team's desk from now on (an account id), or back on your own desk (null). Callers check membership first. */
export async function setDesk(accountId: number | null) {
  const jar = await cookies();
  if (accountId) jar.set(DESK_COOKIE, String(accountId), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 365 * 86_400 });
  else jar.delete(DESK_COOKIE);
}
const self = (u: Omit<User, "actor_id" | "actor_name" | "role">): User => ({ ...u, actor_id: u.id, actor_name: u.name, role: "owner" });

/**
 * The desk being worked on, memoised per request: the signed-in person's own account, or a team account they've
 * switched to (then the account's row, with them as `actor_id` and their `role`). Every desk page and action uses
 * this, so a teammate works on the team's desk with its plan. Person-only things (sign-in, security, the /c share
 * pages, sending as yourself) use `currentPerson()` instead.
 */
export const currentUser = cache(async (): Promise<User | null> => {
  const person = await currentPerson();
  if (!person || (await viewingAs())) return person;
  const desk = Number((await cookies()).get(DESK_COOKIE)?.value);
  if (!Number.isSafeInteger(desk) || desk <= 0 || desk === person.id || !(await teamsOn(desk))) return person;
  const role = await roleOn(desk, person.id);
  if (!role) return person;
  const account = await q.get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ? AND suspended_at IS NULL`, desk);
  return account ? { ...account, actor_id: person.id, actor_name: person.name, role } : person;
});

/** The signed-in person themselves, whatever desk they're working on. Memoised per request. */
export const currentPerson = cache(async (): Promise<User | null> => {
  const view = await viewingAs();
  if (view) {
    // Read-only: a server action (anything that changes data) acts as nobody while viewing.
    if ((await headers()).get("next-action")) return null;
    const cols = USER_COLUMNS;
    const v = await q.get<User>(`SELECT ${cols} FROM users WHERE id = ?`, view.userId);
    return v ? self(v) : null;
  }
  const token = sessionToken(await cookies());
  if (!token) return null;
  const cols = USER_COLUMNS.split(", ").map((c) => `u.${c}`).join(", ");
  // A browser session nobody has used for WEB_IDLE_MS is over, even inside its 30 days.
  const row = await q.get<User & { last_active_at?: number | null; session_hash?: string; session_seen?: number | null }>(
    `SELECT ${cols}, u.last_active_at, s.token_hash AS session_hash, s.last_seen_at AS session_seen FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.kind = 'web' AND s.expires_at > ? AND COALESCE(s.last_seen_at, s.created_at) > ? AND u.suspended_at IS NULL`,
    hashToken(token),
    now(),
    now() - WEB_IDLE_MS,
  );
  if (!row) return null;
  // "Last seen" on the session, written at most once an hour, after the response is sent.
  const sessionHash = row.session_hash ?? "";
  const seen = row.session_seen == null ? null : Number(row.session_seen);
  delete row.session_hash;
  delete row.session_seen;
  after(() => touchSession(sessionHash, seen).catch(() => {}));
  // "Last active" for the admin's beta tracker: written at most once an hour, after the response is sent.
  const last = row.last_active_at;
  delete row.last_active_at;
  if (!last || now() - last > 3_600_000) after(() => q.run("UPDATE users SET last_active_at = ? WHERE id = ?", now(), row.id).catch(() => {}));
  return self(row);
});

/**
 * The desk, but only for someone with at least `min` role on it: account security, billing and deleting the account
 * need "owner" (so they only work on your own account); team and link settings "admin". Server actions call this
 * themselves, so hiding a button is never the only guard.
 */
export async function requireRole(min: TeamRole): Promise<User> {
  const u = await requireUser();
  // Pages and server actions alike go to the Team page with a short note, never to the error screen.
  if (!atLeast(u.role, min)) redirect("/dashboard/settings/team?denied=1");
  return u;
}

/** The signed-in person (never a team desk), or to the login page. */
export async function requirePerson(): Promise<User> {
  const u = await currentPerson();
  if (!u && (await viewingAs())) redirect("/dashboard/floor?readonly=1");
  if (!u) redirect("/login");
  return u;
}

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  // In a read-only admin view, a blocked change goes back to the desk, not to the login page.
  if (!u && (await viewingAs())) redirect("/dashboard/floor?readonly=1");
  if (!u) redirect("/login");
  return u;
}

/** Reset links and password changes live in password-reset.ts (testable without a request); re-exported here. */
export { changePasswordTo, consumePasswordReset, createPasswordReset, findPasswordReset } from "./password-reset";
