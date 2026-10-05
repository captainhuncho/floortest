"use server";

import { passwordStrength } from "@/lib/password-strength";
import { LEGAL } from "@/lib/legal";
import { KINDS } from "@/lib/db";

import { switchOn } from "@/lib/switches";
import { handleHeld } from "@/lib/accounts";
import { BOT_MESSAGE, passedTurnstile } from "@/lib/turnstile";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { consumePasswordReset, createPasswordReset, createSession, currentUser, destroySession, hashPassword, verifyPassword } from "@/lib/auth";
import { now, q } from "@/lib/db";
import { env } from "@/lib/env";
import { APP_URL, sendMail } from "@/lib/mail";
import { RESERVED_HANDLES } from "@/lib/plans";
import { allow, recentCount, record, requestIp } from "@/lib/ratelimit";
import { isProtectedHandle } from "@/lib/identity";
import { sendWelcome } from "@/lib/onboarding";
import { checkSecondFactor, finishSignIn, sendEmailVerification } from "@/lib/security";
import { readChallenge, signChallenge } from "@/lib/totp";

const CHALLENGE = "floortest_2fa";
/** Set by a share link: where to land after signing in or up (only ever a /s/ share page). */
const NEXT = "floortest_next";

async function landing(fallback: string) {
  const jar = await cookies();
  const next = jar.get(NEXT)?.value ?? "";
  if (!/^\/s\/[A-Za-z0-9_-]{10,40}$/.test(next)) return fallback;
  jar.delete(NEXT);
  return next;
}

/** Password (or reset link) checked out. Accounts with two-factor get a code step first. */
async function afterPassword(userId: number, how: "password" | "reset" | "email code") {
  const twoFactor = await q.get("SELECT 1 FROM users WHERE id = ? AND totp_enabled_at IS NOT NULL", userId);
  if (twoFactor) {
    (await cookies()).set(CHALLENGE, signChallenge(userId, env.secret), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 300 });
    redirect("/login/verify");
  }
  await finishSignIn(userId, how);
  redirect(await landing("/dashboard/floor"));
}

export type FormState = { error?: string; ok?: boolean } | undefined;

const HOUR = 3_600_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Keeps "no such account" and "wrong password" equally slow, so timing doesn't reveal which emails exist.
const DUMMY_HASH = hashPassword("timing-equaliser");

/** Invite codes: an existing user's referral code, or one of BETA_INVITE_CODES. */
async function resolveInvite(raw: string, email = "") {
  const code = raw.trim().toUpperCase().slice(0, 32);
  if (!code) return { valid: false, referrerId: null as number | null, code };
  const referrer = await q.get<{ id: number }>("SELECT id FROM users WHERE referral_code = ?", code);
  if (referrer) return { valid: true, referrerId: referrer.id, code };
  // Codes created in the admin area, each with its own cap and a revoke switch.
  const inv = await q.get<{ max_uses: number; email: string | null }>("SELECT max_uses, email FROM invites WHERE code = ? AND revoked_at IS NULL", code);
  if (inv?.email && inv.email !== email.trim().toLowerCase()) return { valid: false, referrerId: null as number | null, code };
  if (inv) return { valid: (await q.count("SELECT COUNT(*) AS n FROM users WHERE invite_code = ?", code)) < inv.max_uses, referrerId: null as number | null, code };
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
  if (form.get("agree") !== "on") return { error: "Please confirm you're 18 or over and agree to the Terms to create an account." };
  if (!(await passedTurnstile(form.get("cf-turnstile-response"), await requestIp()))) return { error: BOT_MESSAGE };
  const invite = await resolveInvite(String(form.get("ref") || form.get("invite") || ""), String(form.get("email") || ""));

  if (!(await switchOn("open_signup")) && !invite.valid) return { error: "That invite code is not valid, has been used, or was sent to a different email. Use the email your invite went to." };
  if (!name || !email || !handle || !password) return { error: "All fields are required." };
  if (!EMAIL.test(email)) return { error: "Enter a valid email." };
  if (!/^[a-z0-9][a-z0-9-_]{1,29}$/.test(handle)) return { error: "Link names use 2–30 letters, numbers, - or _." };
  if (RESERVED_HANDLES.has(handle)) return { error: "That link name is reserved." };
  if (await isProtectedHandle(handle)) return { error: "That name is protected for a well-known artist. If it's you, contact us and we'll set it up." };
  const strength = passwordStrength(password, [name, email, handle]);
  if (!strength.ok) return { error: strength.tip ?? "Choose a stronger password." };
  if (!(await allow("signup_ip", await requestIp(), 10, HOUR))) return { error: "Too many sign-ups from this connection. Try again later." };

  if (await q.get("SELECT 1 FROM users WHERE email = ?", email)) return { error: "An account with that email exists. Log in instead." };
  if ((await q.get("SELECT 1 FROM users WHERE handle = ?", handle)) || (await handleHeld(handle))) return { error: "That link is taken." };

  let userId: number;
  try {
    userId = await q.tx(async (db) => {
      const u = (await db.get<{ id: number }>(
        "INSERT INTO users (email, password_hash, name, handle, referred_by, invite_code, tz, signup_source, kind, terms_accepted_at, terms_version, notify_product, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
        email,
        hashPassword(password),
        name,
        handle,
        invite.referrerId,
        invite.valid ? invite.code : null,
        validTz(String(form.get("tz") || "UTC")),
        String(form.get("source") || "").trim().slice(0, 200),
        KINDS.includes(String(form.get("kind"))) ? String(form.get("kind")) : "dj",
        now(),
        LEGAL.updated,
        form.get("updates") === "on" ? 1 : 0,
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
  redirect(await landing("/dashboard/floor?welcome=1"));
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") || "").slice(0, 200);
  const ip = await requestIp();
  // Failed attempts only, both per connection and per account, so normal logins never lock anyone out.
  const WINDOW = 15 * 60_000;
  if ((await recentCount("login_fail_ip", ip, WINDOW)) >= 20 || (await recentCount("login_fail_email", email, WINDOW)) >= 10)
    return { error: "Too many attempts. Wait 15 minutes, or reset your password." };
  const row = await q.get<{ id: number; password_hash: string; suspended_at: number | null }>("SELECT id, password_hash, suspended_at FROM users WHERE email = ?", email);
  const ok = verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) {
    await record("login_fail_ip", ip);
    await record("login_fail_email", email);
    return { error: "Email or password is incorrect." };
  }
  if (row.suspended_at) return { error: "This account is suspended. To appeal, go to the Contact page and choose Suspension appeal." };
  await afterPassword(row.id, "password");
  return undefined;
}

export async function logout() {
  const u = await currentUser();
  if (u) await audit(u.id, "signed_out");
  await destroySession();
  redirect("/signed-out");
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
  const strength = passwordStrength(password);
  if (!strength.ok) return { error: strength.tip ?? "Choose a stronger password." };
  if (password !== String(form.get("confirm") || "")) return { error: "The two passwords don't match." };
  const userId = await consumePasswordReset(token, password);
  if (!userId) return { error: "This reset link has expired or was already used. Request a new one." };
  await audit(userId, "password_reset");
  await afterPassword(userId, "reset");
  return undefined;
}

const CODE_EMAIL = "floortest_code_email";
const CODE_MS = 10 * 60_000;
const CODE_TRIES = 5;
// Keyed with the app secret, so a leaked table can't be brute-forced back into codes.
const codeHash = (userId: number, code: string) => crypto.createHmac("sha256", env.secret).update(`${userId}:${code}`).digest("hex");

/** Emails a 6-digit sign-in code. Always moves on to the code page, so it can't reveal which emails have accounts. */
export async function requestLoginCode(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  if (!EMAIL.test(email)) return { error: "Enter the email you signed up with." };
  const ip = await requestIp();
  if (!(await allow("login_code_ip", ip, 10, HOUR)) || !(await allow("login_code_email", email, 5, HOUR)))
    return { error: "Too many codes requested. Try again in an hour, or log in with your password." };
  const user = await q.get<{ id: number; name: string; suspended_at: number | null }>("SELECT id, name, suspended_at FROM users WHERE email = ?", email);
  if (user && !user.suspended_at) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    await q.run(
      `INSERT INTO login_codes (user_id, code_hash, attempts, expires_at, created_at) VALUES (?,?,0,?,?)
       ON CONFLICT (user_id) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = excluded.created_at`,
      user.id,
      codeHash(user.id, code),
      now() + CODE_MS,
      now(),
    );
    await sendMail({
      userId: user.id,
      audience: "receiver",
      to: email,
      subject: `${code} is your FloorTest sign-in code`,
      body: `Hi ${user.name.split(/\s+/)[0]},\n\nYour sign-in code is:\n\n${code}\n\nIt works once, for 10 minutes. If you didn't try to sign in, ignore this email. Nobody can get in without the code.\n\n— FloorTest`,
    });
  }
  (await cookies()).set(CODE_EMAIL, email, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: CODE_MS / 1000 });
  redirect("/login/code/enter");
}

/** Checks the emailed code. Five wrong tries uses it up. Two-factor accounts still get the authenticator step. */
export async function verifyLoginCode(_: FormState, form: FormData): Promise<FormState> {
  const jar = await cookies();
  const email = jar.get(CODE_EMAIL)?.value ?? "";
  if (!email) return { error: "That took too long. Ask for a new code." };
  const code = String(form.get("code") || "").replace(/\D/g, "").slice(0, 6);
  const user = await q.get<{ id: number; suspended_at: number | null; email_verified_at: number | null }>("SELECT id, suspended_at, email_verified_at FROM users WHERE email = ?", email);
  // Each try is counted before the code is compared, in one statement, so parallel guesses can't all slip in at once.
  const row = user && (await q.get<{ code_hash: string; attempts: number }>(
    "UPDATE login_codes SET attempts = attempts + 1 WHERE user_id = ? AND expires_at > ? AND attempts < ? RETURNING code_hash, attempts",
    user.id,
    now(),
    CODE_TRIES,
  ));
  if (!user || !row) return { error: "That code has expired. Ask for a new one." };
  const ok = code.length === 6 && crypto.timingSafeEqual(Buffer.from(codeHash(user.id, code)), Buffer.from(row.code_hash));
  if (!ok) return { error: row.attempts >= CODE_TRIES ? "Too many wrong codes. Ask for a new one." : "That code didn't work. Check the latest email and try again." };
  // Used once: deleting it is what makes the code single-use.
  const used = await q.run("DELETE FROM login_codes WHERE user_id = ? AND code_hash = ?", user.id, row.code_hash);
  if (!used.changes) return { error: "That code was already used. Ask for a new one." };
  if (user.suspended_at) return { error: "This account is suspended. To appeal, go to the Contact page and choose Suspension appeal." };
  jar.delete(CODE_EMAIL);
  // Receiving the code proves the address is theirs. The account was never confirmed, so whoever created it may not be
  // this person (someone can sign up with another's email and wait). Reset what the creator set up: sign out every
  // other session, replace the password with an unusable one, and turn off two-factor. The owner sets their own.
  if (!user.email_verified_at) {
    await q.tx(async (db) => {
      await db.run(
        "UPDATE users SET email_verified_at = ?, password_hash = ?, totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL, recovery_codes = '[]' WHERE id = ?",
        now(),
        hashPassword(crypto.randomBytes(32).toString("base64url")),
        user.id,
      );
      await db.run("DELETE FROM sessions WHERE user_id = ?", user.id);
    });
    const u = await q.get<{ email: string; name: string }>("SELECT email, name FROM users WHERE id = ?", user.id);
    if (u)
      await sendMail({
        userId: user.id,
        audience: "receiver",
        to: u.email,
        subject: "Your email is confirmed: set a password",
        body: `Hi ${u.name.split(/\s+/)[0]},\n\nYou've confirmed your email by signing in with a code. To keep your account yours, we signed out every other device and cleared any password or two-factor sign-in set before the email was confirmed.\n\nTo set your own password, use "Forgot your password?" on the log-in page: ${APP_URL}/forgot\n\n— FloorTest`,
      });
    await sendWelcome(user.id);
  }
  await afterPassword(user.id, "email code");
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
  redirect(await landing("/dashboard/floor"));
}

/** From the dashboard banner: send the confirmation email again. */
export async function resendEmailVerification(): Promise<boolean> {
  const u = await currentUser();
  if (!u || u.email_verified_at) return false;
  if (!(await allow("verify_email", String(u.id), 3, HOUR))) return false;
  return sendEmailVerification(u.id);
}
