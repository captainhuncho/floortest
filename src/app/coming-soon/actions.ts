"use server";

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isProd } from "@/lib/env";
import { allow, requestIp } from "@/lib/ratelimit";
import { GATE_COOKIE, GATE_DAYS, gatePassword, gateToken } from "@/lib/site-gate";

/** Checks the coming-soon password; right once and the whole site opens for this browser for 30 days. */
export async function unlockSite(_: { error?: string } | undefined, form: FormData): Promise<{ error?: string } | undefined> {
  const ip = await requestIp();
  if (!(await allow("gate_try", ip, 10, 15 * 60_000))) return { error: "Too many tries. Wait 15 minutes." };
  const want = Buffer.from(gatePassword());
  const got = Buffer.from(String(form.get("password") ?? ""));
  if (!want.length || want.length !== got.length || !crypto.timingSafeEqual(want, got)) return { error: "That password isn't right." };
  (await cookies()).set(GATE_COOKIE, gateToken(), { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: GATE_DAYS * 86_400 });
  const next = String(form.get("next") ?? "/");
  redirect(next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/coming-soon") ? next : "/");
}
