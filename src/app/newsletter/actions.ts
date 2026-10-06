"use server";

import { allow, requestIp } from "@/lib/ratelimit";
import { subscribe } from "@/lib/newsletter";

export type NewsletterState = { ok?: true; error?: string } | undefined;

/** Footer sign-up. Always answers the same way, so it can't be used to find out who is subscribed. */
export async function joinNewsletter(_: NewsletterState, form: FormData): Promise<NewsletterState> {
  if (String(form.get("website") || "")) return { ok: true }; // bots fill the hidden field
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email." };
  const ip = await requestIp();
  if (!(await allow("newsletter_ip", ip, 5, 3_600_000)) || !(await allow("newsletter_email", email, 3, 86_400_000))) return { ok: true };
  await subscribe(email, form.get("offers") === "on", String(form.get("source") || "").slice(0, 200));
  return { ok: true };
}
