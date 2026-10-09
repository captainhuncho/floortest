import { audit } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { issueAppSession } from "@/lib/app-auth";
import { body, fail, json } from "@/lib/api-v1";
import { q } from "@/lib/db";
import { HUMAN_CHECK_AFTER, HUMAN_MESSAGE, humanCheck, recentFailures } from "@/lib/human-check";
import { recentCount, record, requestIp } from "@/lib/ratelimit";
import { checkSecondFactor } from "@/lib/security";

export const runtime = "nodejs";

const DUMMY = hashPassword("timing-equaliser");
const WINDOW = 15 * 60_000;

/**
 * App sign-in: { email, password, code?, humanToken?, device? } → { accessToken, refreshToken, expiresIn }.
 * The same rules as the website, sharing its counters: one message for any wrong detail, the human check after 3 wrong
 * tries (`needsHuman`), the 15-minute lockout, and the two-step code when it's on (`needsCode`).
 */
export async function POST(req: Request) {
  const b = await body(req);
  const email = String(b.email ?? "").trim().toLowerCase().slice(0, 200);
  const password = String(b.password ?? "").slice(0, 200);
  const ip = await requestIp();
  if ((await recentCount("login_fail_ip", ip, WINDOW)) >= 20 || (await recentCount("login_fail_email", email, WINDOW)) >= 10)
    return fail("Too many attempts. Wait 15 minutes, or reset your password.", 429);
  const failures = await recentFailures("login_fail_email", "login_fail_ip", email, ip);
  const form = new FormData();
  form.set("cf-turnstile-response", String(b.humanToken ?? ""));
  if (!(await humanCheck(failures, form, ip)).ok) return fail(HUMAN_MESSAGE, 403, { needsHuman: true });
  const u = await q.get<{ id: number; password_hash: string; suspended_at: number | null; totp_enabled_at: number | null }>(
    "SELECT id, password_hash, suspended_at, totp_enabled_at FROM users WHERE email = ?",
    email,
  );
  const ok = verifyPassword(password, u?.password_hash ?? DUMMY);
  if (!u || !ok) {
    await record("login_fail_ip", ip);
    await record("login_fail_email", email);
    return fail("Email or password is incorrect.", 401, { needsHuman: failures + 1 >= HUMAN_CHECK_AFTER });
  }
  if (u.suspended_at) return fail("This account is suspended.", 403);
  if (u.totp_enabled_at) {
    const code = String(b.code ?? "").trim().slice(0, 20);
    if (!code) return fail("Enter the code from your authenticator app.", 401, { needsCode: true });
    if (!(await checkSecondFactor(u.id, code))) {
      await record("login_fail_ip", ip);
      await record("login_fail_email", email);
      return fail("That code didn't work.", 401, { needsCode: true });
    }
  }
  const tokens = await issueAppSession(u.id, String(b.device ?? "FloorTest app"));
  await audit(u.id, "signed_in", "with the app");
  return json(tokens);
}
