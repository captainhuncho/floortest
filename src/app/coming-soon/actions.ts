"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { localPath } from "@/lib/next-path";
import { isProd } from "@/lib/env";
import { allow, requestIp } from "@/lib/ratelimit";
import { GATE_COOKIE, GATE_DAYS, gateLock, passFor } from "@/lib/site-gate";

/** Checks the coming-soon password; right once and the whole site opens for this browser for 30 days. */
export async function unlockSite(_: { error?: string } | undefined, form: FormData): Promise<{ error?: string } | undefined> {
  const ip = await requestIp();
  if (!(await allow("gate_try", ip, 10, 15 * 60_000))) return { error: "Too many tries. Wait 15 minutes." };
  const next = String(form.get("next") ?? "/");
  const lock = await gateLock();
  // The site is open (no password, or the lock is off): nothing to unlock.
  if (!lock) redirect(localPath(next));
  const want = Buffer.from(lock.password);
  const got = Buffer.from(String(form.get("password") ?? ""));
  if (!want.length || want.length !== got.length || !crypto.timingSafeEqual(want, got)) return { error: "That password isn't right." };
  const pass = passFor(lock);
  if (!pass) return { error: "The site can't be unlocked right now. Try again in a minute." };
  (await cookies()).set(GATE_COOKIE, pass, { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: GATE_DAYS * 86_400 });
  redirect(localPath(next));
}
