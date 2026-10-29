"use server";

import { userByHandle } from "@/lib/desk";
import { allow, requestIp } from "@/lib/ratelimit";
import { requestReopenAlert } from "@/lib/reopen";
import { BOT_MESSAGE, passedTurnstile } from "@/lib/turnstile";
import { normalEmail } from "@/lib/email-normal";

export type ReopenState = { ok?: boolean; error?: string } | undefined;

/**
 * "Email me when it reopens" on a closed, full or paused link. Quiet about duplicates (and about whether the link
 * exists), rate-limited per network, bot-checked like every other public form.
 */
export async function askReopenAlert(_: ReopenState, form: FormData): Promise<ReopenState> {
  if (String(form.get("website") || "")) return { ok: true }; // bots fill the hidden field
  const email = normalEmail(String(form.get("email") || "")).slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email." };
  const ip = await requestIp();
  if (!(await allow("reopen_alert_ip", ip, 5, 3_600_000))) return { error: "Too many requests. Try again later." };
  if (!(await passedTurnstile(form.get("cf-turnstile-response"), ip, "reopen"))) return { error: BOT_MESSAGE };
  const receiver = await userByHandle(String(form.get("handle") || "").slice(0, 30));
  if (receiver) await requestReopenAlert(receiver.id, email);
  return { ok: true };
}
