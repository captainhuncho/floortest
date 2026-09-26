"use server";

import { headers } from "next/headers";
import { currentUser } from "@/lib/auth";
import { sendMail } from "@/lib/mail";
import { supportEmail } from "@/lib/site";

export type ContactState = { ok?: boolean; error?: string } | undefined;

const recent = new Map<string, number[]>();

export async function sendContact(_: ContactState, form: FormData): Promise<ContactState> {
  const h = await headers();
  const ip = (h.get("x-forwarded-for")?.split(",")[0] || "local").trim();
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  if (hits.length >= 5) return { error: "Too many messages from this connection. Try again in an hour." };

  const str = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const name = str("name", 100);
  const email = str("email", 200);
  const topic = str("topic", 40) || "General";
  const message = str("message", 5000);
  if (!name || !message) return { error: "Add your name and a message." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "Enter a valid email so we can reply." };

  hits.push(now);
  recent.set(ip, hits);
  const user = await currentUser();
  await sendMail({
    userId: user?.id ?? null,
    audience: "support",
    to: supportEmail() ?? "support (SUPPORT_EMAIL not set)",
    subject: `[${topic}] ${name}`,
    body: `From: ${name} <${email}>${user ? `\nAccount: @${user.handle}` : ""}\n\n${message}`,
  });
  return { ok: true };
}
