import "server-only";
import { now, q } from "./db";
import { env } from "./env";

export const APP_URL = env.appUrl;

export type Audience = "sender" | "receiver" | "support";

/**
 * Every email is recorded in the outbox so receivers can see what was sent on their behalf.
 * With RESEND_API_KEY set it's also delivered; a delivery failure is logged, never thrown.
 */
export async function sendMail(opts: { userId: number | null; to: string; subject: string; body: string; audience?: Audience }) {
  let status = "logged";
  if (env.email.resendKey) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.email.resendKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.email.from,
          to: opts.to,
          subject: opts.subject,
          text: opts.body,
          ...(env.email.replyTo ? { reply_to: env.email.replyTo } : {}),
        }),
        signal: AbortSignal.timeout(10_000),
      });
      status = res.ok ? "sent" : `failed (${res.status})`;
      if (!res.ok) console.error("[mail] Resend rejected", res.status, await res.text().catch(() => ""));
    } catch (e) {
      status = "failed (network)";
      console.error("[mail] delivery failed", e);
    }
  }
  await q.run(
    "INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at) VALUES (?,?,?,?,?,?,?)",
    opts.userId,
    opts.to,
    opts.subject,
    opts.body,
    status,
    opts.audience ?? "sender",
    now(),
  );
  return status;
}
