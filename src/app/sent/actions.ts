"use server";

import { accountEmailAllowed } from "@/lib/email-budget";
import { allow, requestIp } from "@/lib/ratelimit";
import { sendSenderLinkLater } from "@/lib/senderLink";
import { BOT_MESSAGE, passedTurnstile } from "@/lib/turnstile";
import { normalEmail } from "@/lib/email-normal";

export type SentState = { ok?: boolean; error?: string } | undefined;

/** Emails a sign-in link. Answers the same, in the same time, either way, so it can't reveal who has sent music. */
export async function requestSenderLink(_: SentState, form: FormData): Promise<SentState> {
  const email = normalEmail(String(form.get("email") || "")).slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the email you send music from." };
  const ip = await requestIp();
  // It emails any address that has sent music, so the bot check and the site-wide budget for emails to visitors without an
  // account (it stops before the part of the day kept for sign-in codes and resets) apply, as on the other forms that send email.
  if (!(await passedTurnstile(form.get("cf-turnstile-response"), ip, "sent"))) return { error: BOT_MESSAGE };
  if (!(await allow("sent_ip", ip, 5, 3_600_000)) || !(await allow("sent_email", email, 3, 3_600_000)))
    return { error: "Too many requests. Try again in an hour." };
  if (!(await accountEmailAllowed("public"))) return { ok: true };
  sendSenderLinkLater(email);
  return { ok: true };
}
