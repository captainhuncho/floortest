"use server";

import { accountEmailAllowed } from "@/lib/email-budget";
import { q } from "@/lib/db";
import { APP_URL, sendMail } from "@/lib/mail";
import { allow, requestIp } from "@/lib/ratelimit";
import { signSenderLink } from "@/lib/senderLink";
import { BOT_MESSAGE, passedTurnstile } from "@/lib/turnstile";

export type SentState = { ok?: boolean; error?: string } | undefined;

/** Emails a sign-in link. Answers the same either way, so it can't reveal who has sent music. */
export async function requestSenderLink(_: SentState, form: FormData): Promise<SentState> {
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the email you send music from." };
  const ip = await requestIp();
  // It emails any address that has sent music, so the bot check and the site-wide hourly email budget (shared with
  // sign-in codes and resets) apply, as on the other forms that send email.
  if (!(await passedTurnstile(form.get("cf-turnstile-response"), ip, "sent"))) return { error: BOT_MESSAGE };
  if (!(await allow("sent_ip", ip, 5, 3_600_000)) || !(await allow("sent_email", email, 3, 3_600_000)))
    return { error: "Too many requests. Try again in an hour." };
  if (!(await accountEmailAllowed("public"))) return { ok: true };
  if (await q.get("SELECT 1 FROM senders WHERE lower(email) = ?", email)) {
    const link = signSenderLink(email);
    await sendMail({
      userId: null,
      audience: "sender",
      to: email,
      secrets: [link],
      subject: "Your FloorTest sends",
      body: `Here's your private link to every track you've sent through FloorTest. It works for 24 hours:\n${APP_URL}/sent/${link}\n\nIf you didn't ask for this, ignore this email.\n\n— FloorTest`,
    });
  }
  return { ok: true };
}
