"use server";

import { redirect } from "next/navigation";
import { hashPassword, verifyPassword, upgradePasswordHash } from "@/lib/auth";
import { homeFor, logAdmin, opsAccessFor } from "@/lib/admin";
import { q } from "@/lib/db";
import { createOpsSession, currentOpsAdmin, destroyOpsSession } from "@/lib/ops";
import { recentCount, record, requestIp } from "@/lib/ratelimit";
import { checkSecondFactor } from "@/lib/security";
import { HUMAN_CHECK_AFTER, HUMAN_MESSAGE, humanCheck, recentFailures } from "@/lib/human-check";
import type { FormState } from "../(auth)/actions";

const DUMMY = hashPassword("not-a-real-password");

/**
 * Signs in to the admin area: an admin address with a confirmed email, its password and a two-step code, every time.
 * One answer for every failure, so nothing here reveals which part was wrong or which addresses are admins.
 */
export async function opsSignIn(_: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  const password = String(form.get("password") || "").slice(0, 200);
  const code = String(form.get("code") || "").trim().slice(0, 20);
  const ip = await requestIp();
  const WINDOW = 15 * 60_000;
  if ((await recentCount("ops_fail_ip", ip, WINDOW)) >= 10 || (await recentCount("ops_fail_email", email, WINDOW)) >= 5)
    return { error: "Too many attempts. Wait 15 minutes." };
  const failures = await recentFailures("ops_fail_email", "ops_fail_ip", email, ip);
  if (!(await humanCheck(failures, form, ip)).ok) return { error: HUMAN_MESSAGE, challenge: true };
  const fail = async () => {
    await record("ops_fail_ip", ip);
    await record("ops_fail_email", email);
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
  if (!(await checkSecondFactor(u.id, code))) return fail();
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
