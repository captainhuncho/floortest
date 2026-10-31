import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { now, q } from "./db";
import { env } from "./env";
import { codeMailProblem } from "./code-mail";
import { sendMail } from "./mail";
import { accountEmailAllowed } from "./email-budget";
import { allow, record } from "./ratelimit";

/**
 * Senders without an account prove their email with a 6-digit code before anything uploads. Once confirmed, this
 * browser remembers the address for 30 days (a signed, http-only cookie), so repeat senders aren't asked again.
 */
const HOUR = 3_600_000;
const CODE_TTL = 10 * 60_000;
const MAX_ATTEMPTS = 5;
const REMEMBER = 30 * 24 * HOUR;
const COOKIE = "ft_sender";
/** Resends allowed after each bot check; after that the visitor solves the check again. */
const MAX_RESENDS = 2;

const hash = (email: string, code: string) => crypto.createHmac("sha256", env.secret).update(`code:${email}:${code}`).digest("base64url");
const sign = (body: string) => crypto.createHmac("sha256", env.secret).update(`confirmed:${body}`).digest("base64url");

export class CodeError extends Error {}

/** Resends of a code since this address last passed the bot check (rate_events ids only grow, so the order is exact). */
const resendsSinceCheck = (email: string) =>
  q.count(
    `SELECT COUNT(*) AS n FROM rate_events WHERE bucket = 'sender_code_resend' AND key = ? AND created_at > ?
       AND id > COALESCE((SELECT MAX(id) FROM rate_events WHERE bucket = 'sender_code_human' AND key = ?), 0)`,
    email, now() - 30 * 60_000, email,
  );

/**
 * Emails a fresh code (replacing any earlier one). "human": the caller has just passed the bot check. "resend": a new
 * code after a recent one, at most MAX_RESENDS times per bot check, so one solved check can't buy a stream of emails.
 */
export async function sendCode(email: string, ip: string, how: "human" | "resend") {
  if (how === "resend") {
    // The slot is taken first, then counted, so resends sent at the same moment can't all get under the limit.
    const mine = await q.get<{ id: number }>("INSERT INTO rate_events (bucket, key, created_at) VALUES ('sender_code_resend', ?, ?) RETURNING id", email, now());
    if ((await resendsSinceCheck(email)) > MAX_RESENDS) {
      await q.run("DELETE FROM rate_events WHERE id = ?", mine!.id);
      throw new CodeError("Start again to get a new code.");
    }
  }
  if (!(await allow("sender_code_email", email, 5, HOUR))) throw new CodeError("Too many codes for this email. Try again in an hour.");
  if (!(await allow("sender_code_ip", ip, 20, HOUR))) throw new CodeError("Too many codes from this connection. Try again in an hour.");
  if (how === "human") await record("sender_code_human", email);
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await q.run(
    `INSERT INTO sender_codes (email, code_hash, expires_at, attempts, created_at) VALUES (?,?,?,0,?)
     ON CONFLICT (email) DO UPDATE SET code_hash = excluded.code_hash, expires_at = excluded.expires_at, attempts = 0, created_at = excluded.created_at`,
    email, hash(email, code), now() + CODE_TTL, now(),
  );
  if (!(await accountEmailAllowed("public"))) throw new CodeError("We can't send codes right now. Try again in a few minutes.");
  const mail: Parameters<typeof sendMail>[0] = {
    userId: null,
    audience: "sender",
    to: email,
    secrets: [code],
    subject: "Your FloorTest code to send music",
    expires: true,
    body: `Your code to confirm your email and send your music:\n\n${code}\n\nIt works for 10 minutes. If you didn't try to send music on FloorTest, ignore this email.\n\n— FloorTest`,
  };
  // The sender is waiting on this screen, so a code that didn't go must say so (a report on 29 Oct: "no code came").
  // One more try for a passing failure; the same code both times, so a late first email still works.
  let status = await sendMail(mail);
  if (status.startsWith("failed")) status = await sendMail(mail);
  // Past the day's shared email allowance the code is dropped (it would arrive dead); the sender is told now.
  const problem = codeMailProblem(status);
  if (problem) throw new CodeError(problem);
}

/** A resend only follows a code this email asked for recently, and only a few times per bot check. */
export async function canResend(email: string) {
  if (!(await q.get("SELECT 1 FROM sender_codes WHERE email = ? AND created_at > ?", email, now() - 30 * 60_000))) return false;
  return (await resendsSinceCheck(email)) < MAX_RESENDS;
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
