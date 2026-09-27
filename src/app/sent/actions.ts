"use server";

import { q } from "@/lib/db";
import { APP_URL, sendMail } from "@/lib/mail";
import { allow, requestIp } from "@/lib/ratelimit";
import { signSenderLink } from "@/lib/senderLink";

export type SentState = { ok?: boolean; error?: string } | undefined;

/** Emails a sign-in link. Answers the same either way, so it can't reveal who has sent music. */
export async function requestSenderLink(_: SentState, form: FormData): Promise<SentState> {
  const email = String(form.get("email") || "").trim().toLowerCase().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter the email you send music from." };
  if (!(await allow("sent_ip", await requestIp(), 5, 3_600_000)) || !(await allow("sent_email", email, 3, 3_600_000)))
    return { error: "Too many requests. Try again in an hour." };
  if (await q.get("SELECT 1 FROM senders WHERE lower(email) = ?", email)) {
    await sendMail({
      userId: null,
      audience: "sender",
      to: email,
      subject: "Your FloorTest sends",
      body: `Here's your private link to every track you've sent through FloorTest. It works for 24 hours:\n${APP_URL}/sent/${signSenderLink(email)}\n\nIf you didn't ask for this, ignore this email.\n\n— FloorTest`,
    });
  }
  return { ok: true };
}
