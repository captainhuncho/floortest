"use server";

import { acceptInvite, acceptInviteForEmail, inviteBySecret, inviteForEmail } from "@/lib/account-members";
import { passwordStrength } from "@/lib/password-strength";
import { isAccountType } from "@/lib/account-types";

import { switchOn } from "@/lib/switches";
import { handleHeld } from "@/lib/accounts";
import { BOT_MESSAGE, passedTurnstile } from "@/lib/turnstile";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { NEXT_COOKIE, safeNext, TEAM_INVITE_COOKIE } from "@/lib/next-path";
import { termsVersion } from "@/lib/legal-sharing";
import { redirect } from "next/navigation";
import { audit } from "@/lib/audit";
import { createPasswordReset, createSession, currentPerson, destroySession, hashPassword, setDesk, verifyPassword, upgradePasswordHash } from "@/lib/auth";
import { now, q } from "@/lib/db";
import { env } from "@/lib/env";
import { APP_URL, sendMail } from "@/lib/mail";
import { RESERVED_HANDLES } from "@/lib/plans";
import { allow, recentCount, record, requestIp } from "@/lib/ratelimit";
import { loginLocked, recordLoginFailure } from "@/lib/login-limits";
import { normalEmail } from "@/lib/email-normal";
import { isProtectedHandle } from "@/lib/identity";
import { sendWelcome } from "@/lib/onboarding";
import { checkSecondFactor, finishSignIn, sendEmailVerification } from "@/lib/security";
import { issueTicket, TICKET_MS, ticketUser, spendTicket } from "@/lib/two-step-ticket";
import { GOOGLE_LINK_COOKIE, GOOGLE_SIGNUP_COOKIE, readIdentity, readPendingLink } from "@/lib/google-auth";
import { pinGoogle } from "@/lib/google-link";
import { accountEmailAllowed } from "@/lib/email-budget";
import { HUMAN_CHECK_AFTER, HUMAN_MESSAGE, humanCheck, recentFailures } from "@/lib/human-check";
import { breachedError } from "@/lib/breached";
import { resetWithLink } from "@/lib/password-reset";
import { resolveInvite } from "@/lib/invites";
import { revokeAllSessions } from "@/lib/sessions";
import { checkPasskey, hasPasskey, secondStepOptions, signInOptions } from "@/lib/passkeys";

const CHALLENGE = "floortest_2fa";
/** Set by a share link: where to land after signing in or up (see `safeNext`). */
const NEXT = NEXT_COOKIE;

async function landing(fallback: string) {
  const jar = await cookies();
  const next = jar.get(NEXT)?.value ?? "";
  if (!safeNext(next)) return fallback;
  jar.delete(NEXT);
  return next;
}

/** Password (or reset link) checked out. Accounts with two-factor get a code step first. */
async function afterPassword(userId: number, how: "password" | "reset" | "email code" | "Google") {
  const twoFactor = await q.get("SELECT 1 FROM users WHERE id = ? AND totp_enabled_at IS NOT NULL", userId);
  if (twoFactor) {
    (await cookies()).set(CHALLENGE, await issueTicket(userId), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: TICKET_MS / 1000 });
    redirect("/login/verify");
  }
  await finishSignIn(userId, how);
  redirect(await landing("/dashboard/floor"));
}

/** `challenge`: show the human check (after repeated wrong tries). */
export type FormState = { error?: string; ok?: boolean; challenge?: boolean } | undefined;

const HOUR = 3_600_000;
const INVITE_TRIES_EMAIL = 5;
const INVITE_TRIES_IP = 20;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Keeps "no such account" and "wrong password" equally slow, so timing doesn't reveal which emails exist.
const DUMMY_HASH = hashPassword("timing-equaliser"); // a promise, made once; awaited where a missing account is checked

const validTz = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "UTC";
  }
};

/** The same answer whether the email or the link name is the problem, so sign-up never confirms who has an account. */
const TAKEN = "We couldn't create an account with those details. If you already have one, log in or reset your password. Otherwise, try a different link name.";

type NewAccount = { email: string; firstName: string; lastName: string; handle: string; name: string; passwordHash: string; verified: boolean };

/**
 * Everything both sign-ups (password and Google) check and do once the person is known: the invite (unless sign-up
 * is open), terms, the link name, the rate limit, and creating the account with its Inbox. Returns the new id or an error.
 */
async function createAccount(form: FormData, a: NewAccount, opts: { googleEmail?: boolean } = {}): Promise<{ id: number } | { error: string }> {
  if (form.get("agree") !== "on") return { error: "Please confirm you're 18 or over and agree to the Terms to create an account." };
  const open = await switchOn("open_signup");
  // The invite code is what proves the email while sign-up is closed, so wrong guesses are counted (per email and per
  // connection) and stop well before a code could be found by trying.
  const ip = await requestIp();
  if (!open && ((await recentCount("invite_fail_email", a.email, HOUR)) >= INVITE_TRIES_EMAIL || (await recentCount("invite_fail_ip", ip, HOUR)) >= INVITE_TRIES_IP))
    return { error: "Too many tries. Wait an hour, then use the sign-up link in your invite email." };
  // Closed: only a personal Ops invite to this exact email, with its emailed code, opens an account (src/lib/invites.ts).
  const invite = await resolveInvite(String(form.get("ref") || form.get("invite") || ""), a.email, open, { emailProven: opts.googleEmail });
  // The code only ever went to that inbox, so using it proves the email.
  if (!open && invite.valid) a.verified = true;
  // A team invite sent to this email also opens sign-up during the beta (and proves the email: it came from the link).
  // With Google the email is already proven, so a live invite sent to it counts even without the invite link here.
  const team = (await teamInviteFor(form, a.email)) ?? (opts.googleEmail ? await inviteForEmail(a.email) : undefined);
  if (team) a.verified = true;
  if (!open && !invite.valid && !team) {
    await record("invite_fail_email", a.email);
    await record("invite_fail_ip", ip);
    return { error: "FloorTest is invite-only during the beta. Use the sign-up link in your invite email, with the email it went to." };
  }
  if (!a.firstName || !a.lastName || !a.email || !a.handle) return { error: "Fill in your first name, surname, username and email." };
  if (!EMAIL.test(a.email)) return { error: "Enter a valid email." };
  if (!/^[a-z0-9][a-z0-9-_]{1,29}$/.test(a.handle)) return { error: "Link names use 2–30 letters, numbers, - or _." };
  if (RESERVED_HANDLES.has(a.handle)) return { error: "That link name is reserved." };
  if (await isProtectedHandle(a.handle)) return { error: "That name is protected for a well-known artist. If it's you, contact us and we'll set it up." };
  if (!(await allow("signup_ip", ip, 10, HOUR))) return { error: "Too many sign-ups from this connection. Try again later." };
  // Never say whether an email has an account: the real owner gets a quiet heads-up instead (at most once a day).
  const owner = await q.get<{ id: number; name: string }>("SELECT id, name FROM users WHERE email = ?", a.email);
  if (owner) {
    if ((await allow("signup_exists_notice", a.email, 1, 24 * HOUR)) && (await accountEmailAllowed()))
      await sendMail({
        userId: owner.id,
        audience: "receiver",
        to: a.email,
        reserved: true,
        subject: "Someone tried to sign up with your email",
        body: `Hi ${owner.name.split(/\s+/)[0]},\n\nSomeone just tried to create a FloorTest account with this email address. You already have one, so nothing was created.\n\nIf it was you, log in here: ${APP_URL}/login (forgot your password? ${APP_URL}/forgot)\n\nIf it wasn't you, you don't need to do anything.\n\n— FloorTest`,
      });
    return { error: TAKEN };
  }
  if ((await q.get("SELECT 1 FROM users WHERE handle = ?", a.handle)) || (await handleHeld(a.handle))) return { error: "That link is taken." };
  // Read before the transaction: a second query inside it would wait on the transaction's own connection.
  const terms = await termsVersion();
  try {
    return await q.tx(async (db) => {
      const u = (await db.get<{ id: number }>(
        "INSERT INTO users (email, password_hash, name, first_name, last_name, handle, referred_by, invite_code, tz, signup_source, kind, terms_accepted_at, terms_version, notify_product, product_consent_at, notify_marketing, marketing_consent_at, email_verified_at, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) RETURNING id",
        a.email,
        a.passwordHash,
        a.name,
        a.firstName,
        a.lastName,
        a.handle,
        invite.referrerId,
        invite.valid ? invite.code : null,
        validTz(String(form.get("tz") || "UTC")),
        String(form.get("source") || "").trim().slice(0, 200),
        isAccountType(form.get("kind")) ? form.get("kind") : null,
        now(),
        terms,
        form.get("updates") === "on" ? 1 : 0,
        form.get("updates") === "on" ? now() : null,
        form.get("offers") === "on" ? 1 : 0,
        form.get("offers") === "on" ? now() : null,
        a.verified ? now() : null,
        now(),
      ))!;
      // No collection is made for them: each receiver names and creates their own (owner, 15 Oct; two in the beta).
      return { id: u.id };
    });
  } catch (e) {
    // Lost a race for the same email or link name.
    if ((e as { code?: string })?.code === "23505") return { error: TAKEN };
    throw e;
  }
}

const fromForm = (form: FormData, k: string, max: number) => String(form.get(k) || "").trim().slice(0, max);

export async function signup(_: FormState, form: FormData): Promise<FormState> {
  const firstName = fromForm(form, "first_name", 60);
  const lastName = fromForm(form, "last_name", 60);
  const email = normalEmail(fromForm(form, "email", 200));
  const handle = String(form.get("handle") || "").trim().toLowerCase();
  // Public name: their professional name, or the username when they leave it empty.
  const name = fromForm(form, "name", 80) || handle;
  const password = String(form.get("password") || "");
  if (form.get("agree") !== "on") return { error: "Please confirm you're 18 or over and agree to the Terms to create an account." };
  if (!(await passedTurnstile(form.get("cf-turnstile-response"), await requestIp(), "auth"))) return { error: BOT_MESSAGE };
  if (!password) return { error: "Choose a password." };
  const strength = passwordStrength(password, [name, firstName, lastName, email, handle]);
  if (!strength.ok) return { error: strength.tip ?? "Choose a stronger password." };
  const leaked = await breachedError(password);
  if (leaked) return { error: leaked };
  const r = await createAccount(form, { email, firstName, lastName, handle, name, passwordHash: await hashPassword(password), verified: false });
  if ("error" in r) return r;
  await createSession(r.id);
  // Joining a team: accept the invite and open the team's desk straight away.
  const joined = await joinTeamAfterSignup(form, r.id);
  if (joined) redirect("/dashboard/floor");
  await sendEmailVerification(r.id);
  redirect(await landing("/dashboard/floor?welcome=1"));
}

/**
 * Sign-up after "Continue with Google" found no account. The email comes from Google (already confirmed), never from
 * the form. Same rules as any sign-up otherwise: an invite code during the beta, the required details and the Terms.
 */
export async function signupWithGoogle(_: FormState, form: FormData): Promise<FormState> {
  const jar = await cookies();
  const who = readIdentity(jar.get(GOOGLE_SIGNUP_COOKIE)?.value, env.secret);
  if (!who) return { error: "That took too long. Start again with Continue with Google." };
  const handle = String(form.get("handle") || "").trim().toLowerCase();
  // No password: they sign in with Google or an email code, and can set one later with "Forgot your password?".
  const r = await createAccount(form, {
    email: who.email,
    firstName: fromForm(form, "first_name", 60),
    lastName: fromForm(form, "last_name", 60),
    handle,
    name: fromForm(form, "name", 80) || handle,
    passwordHash: await hashPassword(crypto.randomBytes(32).toString("base64url")),
    verified: true,
  }, { googleEmail: true });
  if ("error" in r) return r;
  jar.delete(GOOGLE_SIGNUP_COOKIE);
  await q.run("UPDATE users SET google_sub = ?, google_linked_at = ? WHERE id = ?", who.sub, now(), r.id);
  await finishSignIn(r.id, "Google");
  // Joining a team (from the invite link, or an invite sent to this Google email): accept it and open the team's desk.
  if ((await joinTeamAfterSignup(form, r.id)) ?? (await joinTeamByEmail(r.id))) redirect("/dashboard/floor");
  await sendWelcome(r.id);
  redirect(await landing("/dashboard/floor?welcome=1"));
}

/**
 * First "Continue with Google" on an existing account: the owner's password approves pinning that Google account.
 * Two-factor (if on) still follows.
 */
export async function approveGoogleLink(_: FormState, form: FormData): Promise<FormState> {
  const jar = await cookies();
  const pending = readPendingLink(jar.get(GOOGLE_LINK_COOKIE)?.value, env.secret);
  if (!pending) return { error: "That took too long. Start again with Continue with Google." };
  if (!(await allow("google_link", String(pending.userId), 10, HOUR))) return { error: "Too many tries. Wait an hour and try again." };
  const row = await q.get<{ password_hash: string; suspended_at: number | null }>("SELECT password_hash, suspended_at FROM users WHERE id = ?", pending.userId);
  if (!row || !(await verifyPassword(String(form.get("password") || ""), row.password_hash))) return { error: "That password isn't right." };
  if (row.suspended_at) return { error: "This account is suspended. To appeal, go to the Contact page and choose Suspension appeal." };
  jar.delete(GOOGLE_LINK_COOKIE);
  if (!(await pinGoogle(pending.userId, pending.sub))) return { error: "That Google account can't be connected to this account. Log in with your password instead." };
  await afterPassword(pending.userId, "Google");
  return undefined;
}

export async function login(_: FormState, form: FormData): Promise<FormState> {
  const email = normalEmail(String(form.get("email") || "")).slice(0, 200);
  const password = String(form.get("password") || "").slice(0, 200);
  const ip = await requestIp();
  // Failed attempts only, per connection and per account on that connection (lib/login-limits).
  if (await loginLocked(email, ip)) return { error: "Too many attempts. Wait 15 minutes, or reset your password." };
  // After a few wrong tries, prove you're human first (Cloudflare). Checked here on the server, so it can't be skipped.
  const failures = await recentFailures("login_fail_email", "login_fail_ip", email, ip);
  const human = await humanCheck(failures, form, ip);
  if (!human.ok) return { error: HUMAN_MESSAGE, challenge: true };
  const row = await q.get<{ id: number; password_hash: string; suspended_at: number | null }>("SELECT id, password_hash, suspended_at FROM users WHERE email = ?", email);
  const ok = await verifyPassword(password, row?.password_hash ?? (await DUMMY_HASH));
  if (!row || !ok) {
    await recordLoginFailure(email, ip);
    return { error: "Email or password is incorrect.", challenge: failures + 1 >= HUMAN_CHECK_AFTER };
  }
  if (row.suspended_at) return { error: "This account is suspended. To appeal, go to the Contact page and choose Suspension appeal." };
  await upgradePasswordHash(row.id, password, row.password_hash);
  await afterPassword(row.id, "password");
  return undefined;
}

export async function logout() {
  const u = await currentPerson();
  if (u) await audit(u.id, "signed_out");
  await destroySession();
  redirect("/signed-out");
}

/** Always answers the same way, so it can't be used to discover which emails have accounts. */
export async function requestPasswordReset(_: FormState, form: FormData): Promise<FormState> {
  const email = normalEmail(String(form.get("email") || "")).slice(0, 200);
  if (!EMAIL.test(email)) return { error: "Enter the email you signed up with." };
  const ip = await requestIp();
  if (!(await allow("reset_ip", ip, 5, HOUR)) || !(await allow("reset_email", email, 3, HOUR)))
    return { error: "Too many requests. Try again in an hour." };
  const user = await q.get<{ id: number; name: string }>("SELECT id, name FROM users WHERE email = ?", email);
  if (user && (await accountEmailAllowed())) {
    const token = await createPasswordReset(user.id);
    await sendMail({
      reserved: true,
      userId: user.id,
      audience: "receiver",
      to: email,
      secrets: [token],
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
  const r = await resetWithLink(token, password, await requestIp());
  if ("error" in r) return r;
  const { userId } = r;
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
  const email = normalEmail(String(form.get("email") || "")).slice(0, 200);
  if (!EMAIL.test(email)) return { error: "Enter the email you signed up with." };
  const ip = await requestIp();
  // Asking for codes again and again: prove you're human first.
  const asked = await recentFailures("login_code_email", "login_code_ip", email, ip);
  if (!(await humanCheck(asked, form, ip)).ok) return { error: HUMAN_MESSAGE, challenge: true };
  if (!(await allow("login_code_ip", ip, 10, HOUR)) || !(await allow("login_code_email", email, 5, HOUR)))
    return { error: "Too many codes requested. Try again in an hour, or log in with your password." };
  const user = await q.get<{ id: number; name: string; suspended_at: number | null }>("SELECT id, name, suspended_at FROM users WHERE email = ?", email);
  if (user && !user.suspended_at && (await accountEmailAllowed())) {
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
      reserved: true,
      userId: user.id,
      audience: "receiver",
      to: email,
      secrets: [code],
      subject: "Your FloorTest sign-in code",
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
  // other session, replace the password with an unusable one, turn off two-factor and remove any passkeys. The owner sets their own.
  if (!user.email_verified_at) {
    await q.tx(async (db) => {
      await db.run(
        "UPDATE users SET email_verified_at = ?, password_hash = ?, totp_secret = NULL, totp_enabled_at = NULL, totp_last_step = NULL, recovery_codes = '[]' WHERE id = ?",
        now(),
        await hashPassword(crypto.randomBytes(32).toString("base64url")),
        user.id,
      );
      await db.run("DELETE FROM passkeys WHERE user_id = ?", user.id);
      await revokeAllSessions(user.id, { db });
    });
    const u = await q.get<{ email: string; name: string }>("SELECT email, name FROM users WHERE id = ?", user.id);
    if (u)
      await sendMail({
        reserved: true,
        userId: user.id,
        audience: "receiver",
        to: u.email,
        subject: "Your email is confirmed: set a password",
        body: `Hi ${u.name.split(/\s+/)[0]},\n\nYou've confirmed your email by signing in with a code. To keep your account yours, we signed out every other device and cleared any password, two-factor sign-in or passkey set before the email was confirmed.\n\nTo set your own password, use "Forgot your password?" on the log-in page: ${APP_URL}/forgot\n\n— FloorTest`,
      });
    await sendWelcome(user.id);
  }
  await afterPassword(user.id, "email code");
  return undefined;
}

/** Second sign-in step: a 6-digit authenticator code or a one-time recovery code. */
export async function verifySecondStep(_: FormState, form: FormData): Promise<FormState> {
  const jar = await cookies();
  const ticket = jar.get(CHALLENGE)?.value;
  const userId = await ticketUser(ticket);
  if (!userId) return { error: "That took too long. Log in again." };
  const key = `user:${userId}`;
  if ((await recentCount("twofa_fail", key, 15 * 60_000)) >= 8) return { error: "Too many wrong codes. Wait 15 minutes and log in again." };
  const result = await checkSecondFactor(userId, String(form.get("code") || "").slice(0, 40));
  if (!result) {
    await record("twofa_fail", key);
    return { error: "That code didn't work. Check your authenticator app and try again." };
  }
  jar.delete(CHALLENGE);
  if (!(await spendTicket(ticket, userId))) return { error: "That took too long. Log in again." };
  await finishSignIn(userId, result === "code" ? "two-factor" : "recovery code");
  redirect(await landing("/dashboard/floor"));
}

/** "Sign in with a passkey", step 1: a one-time challenge for the browser. Null when passkeys can't work at this address. */
export async function passkeySignInStart() {
  if (!(await allow("passkey_start_ip", await requestIp(), 30, 15 * 60_000))) return null;
  return signInOptions();
}

/**
 * Step 2: the passkey's answer. The device asked for a face, fingerprint or PIN before answering, so a passkey is the
 * whole sign-in, two factors in one: no password and no code step.
 */
export async function passkeySignIn(answer: unknown): Promise<FormState> {
  const ip = await requestIp();
  if ((await recentCount("passkey_fail_ip", ip, 15 * 60_000)) >= 20) return { error: "Too many attempts. Wait 15 minutes, or log in with your password." };
  const userId = await checkPasskey("signin", answer);
  if (!userId) {
    await record("passkey_fail_ip", ip);
    return { error: "That passkey didn't work. Try again, or log in with your password." };
  }
  const row = await q.get<{ suspended_at: number | null }>("SELECT suspended_at FROM users WHERE id = ?", userId);
  if (!row || row.suspended_at) return { error: "This account is suspended. To appeal, go to the Contact page and choose Suspension appeal." };
  await finishSignIn(userId, "passkey");
  redirect(await landing("/dashboard/floor"));
}

/** Two-step with a passkey instead of the code, step 1. Null when this account has no passkey. */
export async function passkeySecondStepStart() {
  const userId = await ticketUser((await cookies()).get(CHALLENGE)?.value);
  return userId ? secondStepOptions(userId) : null;
}

/** Step 2: the passkey must belong to the account whose password (or email code) was just checked. */
export async function passkeySecondStep(answer: unknown): Promise<FormState> {
  const jar = await cookies();
  const ticket = jar.get(CHALLENGE)?.value;
  const userId = await ticketUser(ticket);
  if (!userId) return { error: "That took too long. Log in again." };
  const key = `user:${userId}`;
  if ((await recentCount("twofa_fail", key, 15 * 60_000)) >= 8) return { error: "Too many wrong tries. Wait 15 minutes and log in again." };
  if (!(await checkPasskey("second", answer, userId))) {
    await record("twofa_fail", key);
    return { error: "That passkey didn't work. Try again, or enter the code from your authenticator app." };
  }
  jar.delete(CHALLENGE);
  if (!(await spendTicket(ticket, userId))) return { error: "That took too long. Log in again." };
  await finishSignIn(userId, "passkey as two-step");
  redirect(await landing("/dashboard/floor"));
}

/** For the two-step page: whether to offer "Use a passkey instead". */
export async function secondStepHasPasskey() {
  const userId = await ticketUser((await cookies()).get(CHALLENGE)?.value);
  return userId ? hasPasskey(userId) : false;
}

/** From the dashboard banner: send the confirmation email again. */
export async function resendEmailVerification(): Promise<boolean> {
  const u = await currentPerson();
  if (!u || u.email_verified_at) return false;
  if (!(await allow("verify_email", String(u.id), 3, HOUR))) return false;
  return sendEmailVerification(u.id);
}

/** The team invite in a sign-up form, if it's live and was sent to this email. */
async function teamInviteFor(form: FormData, email: string) {
  const secret = String(form.get("team") || "");
  if (!secret) return undefined;
  const inv = await inviteBySecret(secret);
  return inv && inv.email === normalEmail(email) ? inv : undefined;
}

/** After a sign-up from a team invite: join the team and switch to its desk. */
async function joinTeamAfterSignup(form: FormData, userId: number) {
  const secret = String(form.get("team") || "");
  if (!secret) return null;
  const person = await q.get<{ id: number; email: string; email_verified_at: number | null }>("SELECT id, email, email_verified_at FROM users WHERE id = ?", userId);
  if (!person) return null;
  const inv = await acceptInvite(secret, person).catch(() => null);
  return inv ? enterTeam(inv.account_id, person.email) : null;
}

/** After a Google sign-up (email proven by Google): join the team whose invite went to that email, if any. */
async function joinTeamByEmail(userId: number) {
  const person = await q.get<{ id: number; email: string; email_verified_at: number | null }>("SELECT id, email, email_verified_at FROM users WHERE id = ?", userId);
  const inv = person ? await acceptInviteForEmail(person).catch(() => undefined) : undefined;
  return inv ? enterTeam(inv.account_id, person!.email) : null;
}

/** Just joined a team at sign-up: log it, open the team's desk, and forget the invite. */
async function enterTeam(accountId: number, email: string) {
  await audit(accountId, "team_joined", email);
  await setDesk(accountId);
  (await cookies()).delete(TEAM_INVITE_COOKIE);
  return accountId;
}
