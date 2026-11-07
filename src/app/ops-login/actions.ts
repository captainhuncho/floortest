"use server";

import { redirect } from "next/navigation";
import { hashPassword, verifyPassword, upgradePasswordHash } from "@/lib/auth";
import { homeFor, logAdmin, opsAccessFor } from "@/lib/admin";
import { q } from "@/lib/db";
import { createOpsSession, currentOpsAdmin, destroyOpsSession } from "@/lib/ops";
import { recentCount, requestIp } from "@/lib/ratelimit";
import { checkSecondFactor } from "@/lib/security";
import { HUMAN_CHECK_AFTER, HUMAN_MESSAGE, humanCheck, recentFailures } from "@/lib/human-check";
import type { FormState } from "../(auth)/actions";
import { normalEmail } from "@/lib/email-normal";
import { botCheckKey } from "@/lib/turnstile";
import { afterRightPassword, afterWrongPassword, claimTry, holdAnswer, passwordHold } from "@/lib/login-limits";
import { alertGuessedAccount } from "@/lib/login-alert";
import { guardTwoStep } from "@/lib/two-step-limits";

const DUMMY = hashPassword("not-a-real-password");

/**
 * Signs in to the admin area: an admin address with a confirmed email, its password and a two-step code, every time.
 * One answer for every failure, so nothing here reveals which part was wrong or which addresses are admins.
 */
export async function opsSignIn(_: FormState, form: FormData): Promise<FormState> {
  const email = normalEmail(String(form.get("email") || "")).slice(0, 200);
  const password = String(form.get("password") || "").slice(0, 200);
  const code = String(form.get("code") || "").trim().slice(0, 20);
  const ip = await requestIp();
  const WINDOW = 15 * 60_000;
  // Growing holds on this email from this connection (lib/login-limits; owner, 2 Nov), never on the account itself:
  // nobody can lock a staff member out of ops by typing their email. Checked before anything else is tried.
  const hold = await passwordHold("ops", email, ip);
  if (hold) return holdAnswer(hold, "ops");
  if ((await recentCount("ops_fail_ip", ip, WINDOW)) >= 10) return { error: "Too many attempts from this connection. Wait 15 minutes." };
  // With the human check off there's nothing else to ask for, so a stop for one email from anywhere stays.
  if (!(await botCheckKey()) && (await recentCount("ops_fail_email", email, WINDOW)) >= 5) return { error: "Too many attempts. Wait 15 minutes." };
  const failures = await recentFailures("ops_fail_email", "ops_fail_ip", email, ip);
  if (!(await humanCheck(failures, form, ip)).ok) return { error: HUMAN_MESSAGE, challenge: true };
  // This try is counted before anything is checked, so tries at the same moment can't all get through (lib/login-limits).
  const attempt = await claimTry("ops", email, ip);
  if (attempt.hold) return holdAnswer(attempt.hold, "ops");
  // Any failure counts toward the device's hold, the two-step code too: ops needs both every time, and a right password
  // with a wrong code must not let a stolen password guess codes freely. The answer never says which part was wrong.
  const fail = async (): Promise<FormState> => {
    const started = await afterWrongPassword("ops", email, ip, { claimed: true });
    if (started) {
      alertGuessedAccount(email, started, "ops");
      return holdAnswer(started, "ops");
    }
    return { error: "Those details didn't work.", challenge: failures + 1 >= HUMAN_CHECK_AFTER };
  };
  const u = await q.get<{ id: number; password_hash: string; email_verified_at: number | null; totp_enabled_at: number | null; suspended_at: number | null }>(
    "SELECT id, password_hash, email_verified_at, totp_enabled_at, suspended_at FROM users WHERE email = ?",
    email,
  );
  const passwordOk = await verifyPassword(password, u?.password_hash ?? (await DUMMY));
  // The super admin, or an active ops team member; anyone else gets the same "didn't work" as a wrong password.
  const access = u && passwordOk ? await opsAccessFor({ id: u.id, email }) : null;
  if (!u || !passwordOk || !access || !u.email_verified_at || !u.totp_enabled_at || u.suspended_at) return fail();
  // Wrong two-step codes also get growing holds per account, shared with the website and the app (lib/two-step-limits).
  // Ops never says which part was wrong, so a two-step hold answers like any failed sign-in.
  const tried = await guardTwoStep(u.id, () => checkSecondFactor(u.id, code));
  if (!("result" in tried)) return fail();
  await afterRightPassword("ops", email, ip, attempt);
  await upgradePasswordHash(u.id, password, u.password_hash);
  await createOpsSession(u.id);
  await logAdmin(u.id, "signed in to ops", "", ip);
  redirect(homeFor(access));
}

export async function opsSignOut() {
  const u = await currentOpsAdmin();
  if (u) await logAdmin(u.id, "signed out of ops");
  await destroyOpsSession();
  redirect("/ops-login");
}
