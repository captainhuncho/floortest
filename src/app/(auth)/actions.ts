"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { consumePasswordReset, createPasswordReset, createSession, currentUser, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { now, q } from "@/lib/db";
import { env } from "@/lib/env";
import { APP_URL, sendMail } from "@/lib/mail";
import { RESERVED_HANDLES } from "@/lib/plans";
import { allow, recentCount, record, requestIp } from "@/lib/ratelimit";
import { checkSecondFactor, finishSignIn, sendEmailVerification } from "@/lib/security";
import { readChallenge, signChallenge } from "@/lib/totp";

const CHALLENGE = "floortest_2fa";

/** Password (or reset link) checked out. Accounts with two-factor get a code step first. */
async function afterPassword(userId: number, how: "password" | "reset") {
  const twoFactor = await q.get("SELECT 1 FROM users WHERE id = ? AND totp_enabled_at IS NOT NULL", userId);
  if (twoFactor) {
    (await cookies()).set(CHALLENGE, signChallenge(userId, env.secret), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
    redirect("/login/verify");
  }
  await finishSignIn(userId, how);
  redirect("/dashboard/floor");
}

export type FormState = { error?: string; ok?: boolean } | undefined;

const HOUR = 3_600_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Keeps "no such account" and "wrong password" equally slow, so timing doesn't reveal which emails exist.
const DUMMY_HASH = hashPassword("timing-equaliser");

/** Invite codes: an existing user's referral code, or one of BETA_INVITE_CODES. */
async function resolveInvite(raw: string) {
  const code = raw.trim().toUpperCase().slice(0, 32);
  if (!code) return { valid: false, referrerId: null as number | null, code };
  const referrer = await q.get<{ id: number }>("SELECT id FROM users WHERE referral_code = ?", code);
  if (referrer) return { valid: true, referrerId: referrer.id, code };
  // Beta codes are shared, so each one only opens a limited number of accounts.
  const valid = env.inviteCodes.includes(code) && (await q.count("SELECT COUNT(*) AS n FROM users WHERE invite_code = ?", code)) < env.inviteLimit;
  return { valid, referrerId: null as number | null, code };
}

const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
};

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") || "").trim().slice(0, 80);
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  const handle = String(form.get("handle") || "").trim().toLowerCase();
  const password = String(form.get("password") || "");
  const invite = await resolveInvite(String(form.get("ref") || form.get("invite") || ""));

  if (env.signupMode === "invite" && !invite.valid) return { error: "That invite code is not valid or has been used up. Ask whoever invited you for a new one." };
  if (!name || !email || !handle || !password) return { error: "All fields are required." };
  if (!EMAIL.test(email)) return { error: "Enter a valid email." };
  if (!/^[a-z0-9][a-z0-9-_]{1,29}$/.test(handle)) return { error: "Link names use 2–30 letters, numbers, - or _." };
  if (RESERVED_HANDLES.has(handle)) return { error: "That link name is reserved." };
  if (password.length < 8 || password.length > 200) return { error: "Password must be at least 8 characters." };
  if (!(await allow("signup_ip", await requestIp(), 10, HOUR))) return { error: "Too many sign-ups from this connection. Try again later." };

  if (await q.get("SELECT 1 FROM users WHERE email = ?", email)) return { error: "An account with that email exists. Log in instead." };
  if (await q.get("SELECT 1 FROM users WHERE handle = ?", handle)) return { error: "That link is taken." };

  let userId: number;
  try {
    userId = await q.tx(async (db) => {
      const u = (await db.get<{ id: number }>(
        "INSERT INTO users (email, password_hash, name, handle, referred_by, invite_code, tz, created_at) VALUES (?,?,?,?,?,?,?,?) RETURNING id",
        email,
        hashPassword(password),
        name,
        handle,
        invite.referrerId,
        invite.code || null,
        validTz(String(form.get("tz") || "UTC")),
        now(),
      ))!;
      const c = (await db.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?,?,?) RETURNING id", u.id, "Inbox", now()))!;
      await db.run("UPDATE users SET active_collection_id = ? WHERE id = ?", c.id, u.id);
      return u.id;
    });
  } catch (e) {
    // Lost a race for the same email or link name.
    if ((e as { code?: string })?.code === "23505") return { error: "That email or link was just taken. Try another." };
    throw e;
  }
  await createSession(userId);
  await sendEmailVerification(userId);
  redirect("/dashboard/floor?welcome=1");
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") || "").slice(0, 200);
  const ip = await requestIp();
  // Failed attempts only, both per connection and per account, so normal logins never lock anyone out.
  const WINDOW = 15 * 60_000;
  if ((await recentCount("login_fail_ip", ip, WINDOW)) >= 20 || (await recentCount("login_fail_email", email, WINDOW)) >= 10)
    return { error: "Too many attempts. Wait 15 minutes, or reset your password." };
  const row = await q.get<{ id: number; password_hash: string }>("SELECT id, password_hash FROM users WHERE email = ?", email);
  const ok = verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) {
    await record("login_fail_ip", ip);
    await record("login_fail_email", email);
    return { error: "Email or password is incorrect." };
  }
  await afterPassword(row.id, "password");
  return undefined;
}

export async function logout() {
  const u = await currentUser();
  if (u) await audit(u.id, "signed_out");
  await destroySession();
  redirect("/");
}

/** Always answers the same way, so it can't be used to discover which emails have accounts. */
export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  if (!EMAIL.test(email)) return { error: "Enter the email you signed up with." };
  const ip = await requestIp();
  if (!(await allow("reset_ip", ip, 5, HOUR)) || !(await allow("reset_email", email, 3, HOUR)))
    return { error: "Too many requests. Try again in an hour." };
  const user = await q.get<{ id: number; name: string }>("SELECT id, name FROM users WHERE email = ?", email);
  if (user) {
    const token = await createPasswordReset(user.id);
    await sendMail({
      userId: user.id,
      audience: "receiver",
      to: email,
      subject: "Reset your FloorTest password",
      body: `Hi ${user.name.split(/\s+/)[0]},\n\nUse this link within an hour to choose a new password:\n${APP_URL}/reset/${token}\n\nIf you didn't ask for this, ignore this email. Your password hasn't changed.\n\n— FloorTest`,
    });
  }
  return { ok: true };
}

export async function resetPassword(token: string, _: FormState, form: FormData): Promise<FormState> {
  const password = String(form.get("password") || "");
  if (password.length < 8 || password.length > 200) return { error: "Password must be at least 8 characters." };
  if (password !== String(form.get("confirm") || "")) return { error: "The two passwords don't match." };
  const userId = await consumePasswordReset(token, password);
  if (!userId) return { error: "This reset link has expired or was already used. Request a new one." };
  await audit(userId, "password_reset");
  await afterPassword(userId, "reset");
  return undefined;
}

/** Second sign-in step: a 6-digit authenticator code or a one-time recovery code. */
export async function verifySecondStep(_: FormState, form: FormData): Promise<FormState> {
  const jar = await cookies();
  const userId = readChallenge(jar.get(CHALLENGE)?.value, env.secret);
  if (!userId) return { error: "That took too long. Log in again." };
  const key = `user:${userId}`;
  if ((await recentCount("twofa_fail", key, 15 * 60_000)) >= 8) return { error: "Too many wrong codes. Wait 15 minutes and log in again." };
  const result = await checkSecondFactor(userId, String(form.get("code") || "").slice(0, 40));
  if (!result) {
    await record("twofa_fail", key);
    return { error: "That code didn't work. Check your authenticator app and try again." };
  }
  jar.delete(CHALLENGE);
  await finishSignIn(userId, result === "code" ? "two-factor" : "recovery code");
  redirect("/dashboard/floor");
}

/** From the dashboard banner: send the confirmation email again. */
export async function resendEmailVerification(): Promise<boolean> {
  const u = await currentUser();
  if (!u || u.email_verified_at) return false;
  if (!(await allow("verify_email", String(u.id), 3, HOUR))) return false;
  return sendEmailVerification(u.id);
}
