import "server-only";
import { db, now } from "./db";

export const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");

/**
 * Every email is recorded in the outbox so the receiver can see what was sent.
 * When RESEND_API_KEY is configured it is also delivered for real.
 */
export type Audience = "sender" | "receiver" | "support";

export async function sendMail(opts: { userId: number | null; to: string; subject: string; body: string; audience?: Audience }) {
  let status = "logged";
  const key = process.env.RESEND_API_KEY;
  if (key) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: process.env.MAIL_FROM || "FloorTest <onboarding@resend.dev>",
          to: opts.to,
          subject: opts.subject,
          text: opts.body,
        }),
      });
      status = res.ok ? "sent" : `failed (${res.status})`;
    } catch {
      status = "failed (network)";
    }
  }
  db()
    .prepare("INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at) VALUES (?,?,?,?,?,?,?)")
    .run(opts.userId, opts.to, opts.subject, opts.body, status, opts.audience ?? "sender", now());
  return status;
}
