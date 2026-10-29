"use server";

import { allow, requestIp } from "@/lib/ratelimit";
import { subscribeLater } from "@/lib/newsletter";
import { accountEmailAllowed } from "@/lib/email-budget";
import { BOT_MESSAGE, passedTurnstile } from "@/lib/turnstile";

export type NewsletterState = { ok?: true; error?: string } | undefined;

/** Footer sign-up. Always answers the same way, in the same time, so it can't be used to find out who is subscribed. */
export async function joinNewsletter(_: NewsletterState, form: FormData): Promise<NewsletterState> {
  if (String(form.get("website") || "")) return { ok: true }; // bots fill the hidden field
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email." };
  const ip = await requestIp();
  // It emails any address typed in, so the bot check and the site-wide budget for emails to visitors without an account
  // (it stops before the part of the day kept for sign-in codes and resets) apply, as on the other forms that email strangers.
  if (!(await passedTurnstile(form.get("cf-turnstile-response"), ip, "newsletter"))) return { error: BOT_MESSAGE };
  if (!(await allow("newsletter_ip", ip, 5, 3_600_000)) || !(await allow("newsletter_email", email, 3, 86_400_000))) return { ok: true };
  if (!(await accountEmailAllowed("public"))) return { ok: true };
  subscribeLater(email, form.get("offers") === "on", String(form.get("source") || "").slice(0, 200));
  return { ok: true };
}
