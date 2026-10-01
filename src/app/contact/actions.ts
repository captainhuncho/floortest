"use server";

import { q } from "@/lib/db";

import { currentUser } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { allow, requestIp } from "@/lib/ratelimit";
import { BOT_MESSAGE, passedTurnstile } from "@/lib/turnstile";
import { supportEmail } from "@/lib/site";

export type ContactState = { ok?: boolean; error?: string } | undefined;

export async function sendContact(_: ContactState, form: FormData): Promise<ContactState> {
  if (!(await allow("contact_ip", await requestIp(), 5, 3_600_000))) return { error: "Too many messages from this connection. Try again in an hour." };
  if (!(await passedTurnstile(form.get("cf-turnstile-response"), await requestIp()))) return { error: BOT_MESSAGE };

  const str = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const name = str("name", 100);
  const email = str("email", 200);
  const topic = str("topic", 40) || "General";
  const message = str("message", 5000);
  if (!name || !message) return { error: "Add your name and a message." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email so we can reply." };

  const user = await currentUser();
  // Kept in the admin inbox whether or not SUPPORT_EMAIL is set.
  await q.run(
    "INSERT INTO contact_messages (user_id, name, email, topic, message, created_at) VALUES (?,?,?,?,?,?)",
    user?.id ?? null,
    name,
    email,
    topic,
    message,
    Date.now(),
  );
  await sendMail({
    userId: user?.id ?? null,
    audience: "support",
    to: supportEmail() ?? "support (SUPPORT_EMAIL not set)",
    subject: `[${topic}] ${name}`,
    body: `From: ${name} <${email}>${user ? `\nAccount: @${user.handle}` : ""}\n\n${message}`,
  });
  return { ok: true };
}
