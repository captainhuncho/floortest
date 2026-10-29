import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { now, q } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";
import { accountEmailAllowed } from "./email-budget";
import { allow } from "./ratelimit";

/**
 * Senders without an account prove their email with a 6-digit code before anything uploads. Once confirmed, this
 * browser remembers the address for 30 days (a signed, http-only cookie), so repeat senders aren't asked again.
 */
const HOUR = 3_600_000;
const CODE_TTL = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const REMEMBER = 30 * 24 * HOUR;
const COOKIE = "ft_sender";

const hash = (email: string, code: string) => crypto.createHmac("sha256", env.secret).update(`code:${email}:${code}`).digest("base64url");
const sign = (body: string) => crypto.createHmac("sha256", env.secret).update(`confirmed:${body}`).digest("base64url");

export class CodeError extends Error {}

/** Emails a fresh code (replacing any earlier one). The caller has already passed the bot check, or is resending. */
export async function sendCode(email: string, ip: string) {
  if (!(await allow("sender_code_email", email, 5, HOUR))) throw new CodeError("Too many codes for this email. Try again in an hour.");
  if (!(await allow("sender_code_ip", ip, 20, HOUR))) throw new CodeError("Too many codes from this connection. Try again in an hour.");
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await q.run(
    `INSERT INTO sender_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?,?,?,0,?)
     ON CONFLICT (email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`,
    email, hash(email, code), now() + CODE_TTL, now(),
  );
  if (!(await accountEmailAllowed())) throw new CodeError("We can't send codes right now. Please try again in a few minutes.");
  const mail: Parameters<typeof sendMail>[0] = {
    userId: null,
    audience: "sender",
    to: email,
    secrets: [code],
    subject: `${code} is your FloorTest code`,
    body: `Your code to confirm your email and send your music:\n\n${code}\n\nIt works for 10 minutes. If you didn't try to send music on FloorTest, ignore this email.\n\n— FloorTest`,
  };
  // The sender is waiting on this screen, so a code that didn't go must say so (a report on 29 Oct: "no code came").
  // One more try for a passing failure; the same code both times, so a late first email still works.
  let status = await sendMail(mail);
  if (status.startsWith("failed")) status = await sendMail(mail);
  if (status.startsWith("skipped"))
    throw new CodeError("Emails to this address bounced before, so the code can't reach it. Check the address, or use another one.");
  if (status.startsWith("failed")) throw new CodeError("The code email didn't go through. Check the address, then try again in a minute.");
}

/** A resend only follows a code this email asked for recently (so it can't skip the bot check). */
export async function canResend(email: string) {
  return !!(await q.get("SELECT 1 FROM sender_codes WHERE email = ? AND created_at > ?", email, now() - 30 * 60_000));
}

/**
 * Checks a typed code; right once, then it's used up. Wrong five times and a new code is needed. Each try is counted
 * before the code is compared, in one statement, so guesses sent at the same moment can't all get past the limit.
 */
export async function checkCode(email: string, code: string) {
  const row = await q.get<{ code_hash: string; attempts: number }>(
    "UPDATE sender_codes SET attempts = attempts + 1 WHERE email = ? AND expires_at >= ? AND attempts < ? RETURNING code_hash, attempts",
    email,
    now(),
    MAX_ATTEMPTS,
  );
  if (!row) {
    const used = await q.get("SELECT 1 FROM sender_codes WHERE email = ? AND expires_at >= ?", email, now());
    throw new CodeError(used ? "Too many wrong tries. Send a new code." : "That code has expired. Send a new one.");
  }
  const want = Buffer.from(row.code_hash);
  const got = Buffer.from(hash(email, code.replace(/\D/g, "")));
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got))
    throw new CodeError(row.attempts >= MAX_ATTEMPTS ? "Too many wrong tries. Send a new code." : "That code isn't right. Check the email and try again.");
  // Deleting it is what makes it single-use: of two right answers at once, only one gets through.
  if (!(await q.run("DELETE FROM sender_codes WHERE email = ? AND code_hash = ?", email, row.code_hash)).changes) throw new CodeError("That code was already used. Send a new one.");
  const body = `${Buffer.from(email).toString("base64url")}.${Date.now() + REMEMBER}`;
  (await cookies()).set(COOKIE, `${body}.${sign(body)}`, { httpOnly: true, secure: env.appUrl.startsWith("https"), sameSite: "lax", path: "/", maxAge: REMEMBER / 1000 });
}

/** The email this browser has confirmed, if any. */
export async function confirmedEmail(): Promise<string | null> {
  const [e, exp, mac] = ((await cookies()).get(COOKIE)?.value ?? "").split(".");
  if (!e || !exp || !mac) return null;
  const want = sign(`${e}.${exp}`);
  if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac)) || Number(exp) < Date.now()) return null;
  return Buffer.from(e, "base64url").toString("utf8");
}
