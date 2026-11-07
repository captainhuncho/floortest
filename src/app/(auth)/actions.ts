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
import { afterResponse, APP_URL, sendMail } from "@/lib/mail";
import { RESERVED_HANDLES } from "@/lib/plans";
import { allow, claim, handBack, recentCount, record, requestIp } from "@/lib/ratelimit";
import { afterRightPassword, claimTry, holdAnswer, loginLocked, passwordHold, recordLoginFailure } from "@/lib/login-limits";
import { alertGuessedAccount } from "@/lib/login-alert";
import { normalEmail } from "@/lib/email-normal";
import { maskEmail } from "@/lib/mask-email";
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
import { claimPersonalInvite, resolveInvite } from "@/lib/invites";
import { revokeAllSessions } from "@/lib/sessions";
import { checkPasskey, hasPasskey, secondStepOptions, signInOptions } from "@/lib/passkeys";
import { guardTwoStep } from "@/lib/two-step-limits";
import { emailRequestBlocked } from "@/lib/email-request-limits";

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

/**
 * `challenge`: show the human check (after repeated wrong tries). `holdLeft`: password tries from this device are paused
 * for this long (ms), so the form counts down; `holdFinal`: the last, 24-hour step, which offers "Report this".
 */
export type FormState = { error?: string; ok?: boolean; challenge?: boolean; holdLeft?: number; holdFinal?: boolean } | undefined;

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
async function createAccount(form: FormData, a: NewAccount, opts: { googleEmail?: boolean } = {}): Promise<{ id: number; teamAccount?: number } | { error: string }> {
  if (form.get("agree") !== "on") return { error: "Please confirm you're 18 or over and agree to the Terms to create an account." };
  const open = await switchOn("open_signup");
  // The invite code is what proves the email while sign-up is closed, so wrong guesses are counted (per email and per
  // connection) and stop well before a code could be found by trying.
  const ip = await requestIp();
  // A team invite link counts too: its masked address must not be guessable by trying emails (owner, 2 Nov).
  if ((!open || form.get("team")) && ((await recentCount("invite_fail_email", a.email, HOUR)) >= INVITE_TRIES_EMAIL || (await recentCount("invite_fail_ip", ip, HOUR)) >= INVITE_TRIES_IP))
    return { error: "Too many tries. Wait an hour, then use the sign-up link in your invite email." };
  // Closed: only a personal Ops invite to this exact email, with its emailed code, opens an account (src/lib/invites.ts).
  const invite = await resolveInvite(String(form.get("ref") || form.get("invite") || ""), a.email, open, { emailProven: opts.googleEmail });
  // The code only ever went to that inbox, so using it proves the email.
  if (!open && invite.valid) a.verified = true;
  // A team invite sent to this email also opens sign-up during the beta (and proves the email: it came from the link).
  // With Google the email is already proven, so a live invite sent to it counts even without the invite link here.
  const team = (await teamInviteFor(form, a.email)) ?? (opts.googleEmail ? await inviteForEmail(a.email) : undefined);
  if (team) a.verified = true;
  // A live team invite typed with a different email: say which address it went to (masked), rather than creating an
  // account that silently doesn't join the team.
  const teamMiss = !team ? await liveTeamInvite(form) : undefined;
  // Counted like a wrong invite code, so the masked hint can't be used to guess the full address.
  if (teamMiss) {
    await record("invite_fail_email", a.email);
    await record("invite_fail_ip", ip);
    return { error: `This invite went to ${maskEmail(teamMiss.email)}. Sign up with that email to join ${teamMiss.account_name}.` };
  }
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
  // Never say whether an email has an account: the real owner gets a quiet heads-up instead (at most once a day), sent
  // after the answer has gone back so how long it takes never shows the email has an account (sign-in audit M2).
  const owner = await q.get<{ id: number; name: string }>("SELECT id, name FROM users WHERE email = ?", a.email);
  if (owner) {
    afterResponse(async () => {
      if (!(await allow("signup_exists_notice", a.email, 1, 24 * HOUR)) || !(await accountEmailAllowed())) return;
      await sendMail({
        userId: owner.id,
        audience: "receiver",
        to: a.email,
        reserved: true,
        subject: "Someone tried to sign up with your email",
        body: `Hi ${owner.name.split(/\s+/)[0]},\n\nSomeone just tried to create a FloorTest account with this email address. You already have one, so nothing was created.\n\nIf it was you, log in here: ${APP_URL}/login (forgot your password? ${APP_URL}/forgot)\n\nIf it wasn't you, you don't need to do anything.\n\n— FloorTest`,
      });
    }, "[signup] existing-account notice failed");
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
      // A personal invite is used once (owner, 5 Nov): marked here, in the same transaction, so two sign-ups racing on
      // one code can't both get in, and deleting this account later never brings the invite back.
      if (!(await claimPersonalInvite(db, invite.valid && invite.personal ? invite.code : null, a.email))) throw INVITE_GONE;
      // A team invite is accepted in the same transaction (owner, 5 Nov: used once). When it is what let them in during
      // the beta and a cancel, expiry or another accept landed first, the account rolls back; otherwise they just
      // don't join.
      let teamAccount: number | undefined;
      if (team) {
        const t = now();
        const took = await db.get<{ account_id: number }>(
          "UPDATE account_invites SET accepted_at = ? WHERE id = ? AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > ? RETURNING account_id",
          t, team.id, t,
        );
        if (took) {
          await db.run(
            "INSERT INTO account_members (account_id, user_id, role, invited_by, created_at) VALUES (?,?,?,(SELECT invited_by FROM account_invites WHERE id = ?),?) ON CONFLICT (account_id, user_id) DO NOTHING",
            took.account_id, u.id, team.role, team.id, t,
          );
          teamAccount = took.account_id;
        } else if (!open && !invite.valid) throw TEAM_GONE;
      }
      // No collection is made for them: each receiver names and creates their own (owner, 15 Oct; two in the beta).
      return { id: u.id, teamAccount };
    });
  } catch (e) {
    if (e === INVITE_GONE) return { error: "This invite has been used or has expired. Ask the person who invited you for a new one." };
    if (e === TEAM_GONE) return { error: "This invite isn't valid any more. Ask the person who invited you for a new one." };
    // Lost a race for the same email or link name.
    if ((e as { code?: string })?.code === "23505") return { error: TAKEN };
    throw e;
  }
}

/** Thrown inside the sign-up transaction when the personal invite was claimed first, so the account rolls back. */
const INVITE_GONE = Symbol("invite gone");
/** Thrown inside the sign-up transaction when the team invite that let them in was cancelled, expired or taken first. */
const TEAM_GONE = Symbol("team invite gone");

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
  const joined = r.teamAccount ? await enterTeam(r.teamAccount, email) : await joinTeamAfterSignup(form, r.id);
  if (joined) redirect("/dashboard/floor");
  await sendEmailVerification(r.id);
  // The guided sign-up carries on after the account exists: check your email, add a photo, your link is ready
  // (/signup/ready, which ends on /dashboard/floor?welcome=1). A share link's landing still wins.
  redirect(await landing("/signup/ready"));
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
  if ((r.teamAccount ? await enterTeam(r.teamAccount, who.email) : null) ?? (await joinTeamAfterSignup(form, r.id)) ?? (await joinTeamByEmail(r.id)))
    redirect("/dashboard/floor");
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
  // A hold on this email from this connection (5 wrong passwords, then longer each time; lib/login-limits): checked
  // before the password, so nothing is tried while it lasts. The same answer whether or not the email has an account.
  const hold = await passwordHold("login", email, ip);
  if (hold) return holdAnswer(hold);
  // Failed attempts only: per connection, or per email when the human check is off (lib/login-limits).
  const locked = await loginLocked(email, ip);
  if (locked === "connection") return { error: "Too many attempts from this connection. Wait 15 minutes, or reset your password." };
  if (locked === "email") return { error: "Too many attempts. Wait 15 minutes, or reset your password." };
  // After a few wrong tries, prove you're human first (Cloudflare). Checked here on the server, so it can't be skipped.
  const failures = await recentFailures("login_fail_email", "login_fail_ip", email, ip);
  const human = await humanCheck(failures, form, ip);
  if (!human.ok) return { error: HUMAN_MESSAGE, challenge: true };
  // This try is counted before the password is checked, so tries at the same moment can't all get through; handed back below if it's right.
  const attempt = await claimTry("login", email, ip);
  if (attempt.hold) return holdAnswer(attempt.hold);
  const row = await q.get<{ id: number; password_hash: string; suspended_at: number | null }>("SELECT id, password_hash, suspended_at FROM users WHERE email = ?", email);
  const ok = await verifyPassword(password, row?.password_hash ?? (await DUMMY_HASH));
  if (!row || !ok) {
    const started = await recordLoginFailure(email, ip);
    if (started) {
      // The account holder hears about it (at most hourly, sent after this answer so timing gives nothing away).
      alertGuessedAccount(email, started);
      return holdAnswer(started);
    }
    return { error: "Email or password is incorrect.", challenge: failures + 1 >= HUMAN_CHECK_AFTER };
  }
  await afterRightPassword("login", email, ip, attempt);
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
  const blocked = await emailRequestBlocked("reset", email, ip, form);
  if (blocked) return blocked;
  // Looked up and sent after the answer has gone back, so how long the page takes never shows whether the address has
  // an account (sign-in audit M2). A suspended account gets no link: it couldn't use the session anyway.
  afterResponse(async () => {
    const user = await q.get<{ id: number; name: string }>("SELECT id, name FROM users WHERE email = ? AND suspended_at IS NULL", email);
    if (!user || !(await accountEmailAllowed())) return;
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
  }, "[reset] reset email failed");
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
/** The browser that asked for a code: each gets its own, so asking with someone's email never replaces theirs (M4). */
const CODE_DEVICE = "floortest_code_device";
const CODE_MS = 10 * 60_000;
const CODE_TRIES = 5;
/** One answer for a wrong, used-up or missing code, whether or not the email has an account (sign-in audit M3). */
const CODE_FAILED = "That code didn't work or has expired. Check the latest email, or ask for a new code.";
// Keyed with the app secret, so a leaked table can't be brute-forced back into codes.
const codeHash = (userId: number, code: string) => crypto.createHmac("sha256", env.secret).update(`${userId}:${code}`).digest("hex");
const deviceHash = (device: string) => crypto.createHash("sha256").update(device).digest("hex");
const DEVICE = /^[A-Za-z0-9_-]{32}$/;
/**
 * Wrong codes for one email in an hour, from every browser together (Safety, 7 Nov): each browser's code has its own five
 * tries, so without this a guesser could ask for code after code. Past it, code sign-in for that email pauses; password
 * and passkey still work. Keyed on the email, not the account, so it looks the same whether or not there is one.
 */
const CODE_GUESSES_AN_HOUR = 20;
const CODES_PAUSED = "Too many wrong codes for this email. Try again in an hour, reset your password, or log in with your password or a passkey.";
/** Code tries from one connection in an hour, for every email together: one connection can't pause code sign-in for many addresses. */
const CODE_TRIES_PER_IP = 30;
const CODE_TRIES_IP_PAUSED = "Too many codes tried from this connection. Try again in an hour, or log in with your password or a passkey.";
const CODE_TOO_LONG = "That took too long. Ask for a new code.";
/** Live codes an account can have at once, across browsers. A new browser past it gets none; older ones are never replaced. */
const LIVE_CODES = 5;
/**
 * Proof that this browser asked for a code for this email in the last 10 minutes (Safety, 7 Nov): the time, and an HMAC on
 * the app secret over email, browser and time. Without it, anyone could set the email and browser cookies by hand and
 * spend an address's wrong-code allowance without ever asking for a code (or passing the human check). Set for every
 * request, account or not, so it tells nothing.
 */
const CODE_PASS = "floortest_code_pass";
const passMac = (email: string, device: string, t: number) => crypto.createHmac("sha256", env.secret).update(`code-pass:${email}|${device}|${t}`).digest("base64url");
const makePass = (email: string, device: string, t = now()) => `${t}.${passMac(email, device, t)}`;
/** The pass's time when it is genuine, for this email and browser, and under 10 minutes old; otherwise null. */
function passTime(pass: string, email: string, device: string): number | null {
  const [ts, mac] = pass.split(".");
  const t = Number(ts);
  if (!Number.isSafeInteger(t) || !mac || now() - t > CODE_MS || t > now() + 60_000) return null;
  const want = Buffer.from(passMac(email, device, t));
  const got = Buffer.from(mac);
  return got.length === want.length && crypto.timingSafeEqual(got, want) ? t : null;
}

/** Emails a 6-digit sign-in code. Always moves on to the code page, so it can't reveal which emails have accounts. */
export async function requestLoginCode(_: FormState, form: FormData): Promise<FormState> {
  const email = normalEmail(String(form.get("email") || "")).slice(0, 200);
  if (!EMAIL.test(email)) return { error: "Enter the email you signed up with." };
  const ip = await requestIp();
  const blocked = await emailRequestBlocked("login_code", email, ip, form);
  if (blocked) return blocked;
  const jar = await cookies();
  const kept = jar.get(CODE_DEVICE)?.value ?? "";
  const device = DEVICE.test(kept) ? kept : crypto.randomBytes(24).toString("base64url");
  // Looked up and sent after the answer has gone back, so how long the page takes never shows whether the address has
  // an account (sign-in audit M2). The code is this browser's alone: a new one here replaces only this browser's.
  afterResponse(async () => {
    const user = await q.get<{ id: number; name: string }>("SELECT id, name FROM users WHERE email = ? AND suspended_at IS NULL", email);
    if (!user || !(await accountEmailAllowed())) return;
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    const requester = deviceHash(device);
    // Only while the account has fewer than LIVE_CODES live codes from other browsers: past that, nothing is stored or sent.
    // The account's row is locked for the count and the write, so requests at the same moment can't overshoot the cap.
    const saved = await q.tx(async (db) => {
      await db.get("SELECT id FROM users WHERE id = ? FOR UPDATE", user.id);
      return db.run(
        `INSERT INTO sign_in_codes (user_id, requester, code_hash, attempts, expires_at, created_at)
         SELECT ?, ?, ?, 0, ?, ? WHERE (SELECT COUNT(*) FROM sign_in_codes WHERE user_id = ? AND requester <> ? AND expires_at > ?) < ?
         ON CONFLICT (user_id, requester) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at, created_at = excluded.created_at`,
        user.id,
        requester,
        codeHash(user.id, code),
        now() + CODE_MS,
        now(),
        user.id,
        requester,
        now(),
        LIVE_CODES,
      );
    });
    if (!saved.changes) {
      // Shown on Admin → Security: someone may be keeping this account's codes full.
      await record("login_code_full", String(user.id));
      return;
    }
    await sendMail({
      reserved: true,
      userId: user.id,
      audience: "receiver",
      to: email,
      secrets: [code],
      subject: "Your FloorTest sign-in code",
      body: `Hi ${user.name.split(/\s+/)[0]},\n\nYour sign-in code is:\n\n${code}\n\nIt works once, for 10 minutes, in the browser you asked for it in. If you didn't try to sign in, ignore this email. Nobody can get in without the code.\n\n— FloorTest`,
    });
  }, "[login] sign-in code email failed");
  const cookie = { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: CODE_MS / 1000 } as const;
  jar.set(CODE_EMAIL, email, cookie);
  jar.set(CODE_DEVICE, device, cookie);
  jar.set(CODE_PASS, makePass(email, device), cookie);
  redirect("/login/code/enter");
}

/** Checks the emailed code. Five wrong tries uses it up. Two-factor accounts still get the authenticator step. */
export async function verifyLoginCode(_: FormState, form: FormData): Promise<FormState> {
  const jar = await cookies();
  const email = jar.get(CODE_EMAIL)?.value ?? "";
  const device = jar.get(CODE_DEVICE)?.value ?? "";
  // Nothing is counted until the cookies prove this browser asked for a code for this email in the last 10 minutes; a
  // hand-set or old pair gets the same answer as a timed-out one, whether or not the email has an account.
  if (email.length > 200 || !EMAIL.test(email) || !DEVICE.test(device)) return { error: CODE_TOO_LONG };
  const pass = passTime(jar.get(CODE_PASS)?.value ?? "", email, device);
  if (pass === null) return { error: CODE_TOO_LONG };
  const code = String(form.get("code") || "").replace(/\D/g, "").slice(0, 6);
  if ((await claim("login_code_verify_ip", await requestIp(), CODE_TRIES_PER_IP, HOUR)) === null) return { error: CODE_TRIES_IP_PAUSED };
  // Five tries per code request in this browser, account or not: more needs another request, which meets the human check.
  const thisPass = crypto.createHash("sha256").update(`${email}|${device}|${pass}`).digest("hex");
  if ((await claim("login_code_guess_pass", thisPass, CODE_TRIES, HOUR)) === null) return { error: CODE_FAILED };
  // This try takes its place in the email's hourly count before anything is compared, and is handed back if it's refused
  // here or turns out right, so parallel guesses from many browsers can't all slip under the cap.
  const guess = await claim("login_code_guess", email, CODE_GUESSES_AN_HOUR, HOUR);
  if (guess === null) return { error: CODES_PAUSED };
  const user = await q.get<{ id: number; suspended_at: number | null; email_verified_at: number | null }>("SELECT id, suspended_at, email_verified_at FROM users WHERE email = ?", email);
  // Each try is counted before the code is compared, in one statement, so parallel guesses can't all slip in at once.
  // Run for a missing account too (it matches nothing), so the time taken doesn't tell the two apart.
  const row = await q.get<{ code_hash: string; attempts: number }>(
    "UPDATE sign_in_codes SET attempts = attempts + 1 WHERE user_id = ? AND requester = ? AND expires_at > ? AND attempts < ? RETURNING code_hash, attempts",
    user?.id ?? 0,
    deviceHash(device),
    now(),
    CODE_TRIES,
  );
  const ok = !!user && !!row && code.length === 6 && crypto.timingSafeEqual(Buffer.from(codeHash(user.id, code)), Buffer.from(row.code_hash));
  if (!user || !row || !ok) return { error: CODE_FAILED };
  // Used once: deleting it is what makes the code single-use.
  const used = await q.run("DELETE FROM sign_in_codes WHERE user_id = ? AND requester = ? AND code_hash = ?", user.id, deviceHash(device), row.code_hash);
  if (!used.changes) return { error: CODE_FAILED };
  await handBack(guess);
  if (user.suspended_at) return { error: "This account is suspended. To appeal, go to the Contact page and choose Suspension appeal." };
  jar.delete(CODE_EMAIL);
  jar.delete(CODE_DEVICE);
  jar.delete(CODE_PASS);
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
  const tried = await guardTwoStep(userId, () => checkSecondFactor(userId, String(form.get("code") || "").slice(0, 40)));
  if ("held" in tried) return tried.held;
  if ("wrong" in tried) return { error: "That code didn't work. Check your authenticator app and try again." };
  const result = tried.result;
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
  const tried = await guardTwoStep(userId, () => checkPasskey("second", answer, userId));
  if ("held" in tried) return tried.held;
  if ("wrong" in tried) return { error: "That passkey didn't work. Try again, or enter the code from your authenticator app." };
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

/** The live team invite named in a sign-up form, whatever email was typed. */
async function liveTeamInvite(form: FormData) {
  const secret = String(form.get("team") || "");
  return secret ? inviteBySecret(secret) : undefined;
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
