import "server-only";
import { unsubToken, type UnsubKind } from "./unsubscribe";
import { now, q } from "./db";
import { env, isPreview } from "./env";
import { recordIncident } from "./incidents";

export const APP_URL = env.appUrl;

export type Audience = "sender" | "receiver" | "support";

/**
 * Every email is recorded in the outbox so receivers can see what was sent on their behalf.
 * With RESEND_API_KEY set it's also delivered; a delivery failure is logged, never thrown.
 */
export async function sendMail(opts: { userId: number | null; to: string; subject: string; body: string; audience?: Audience; unsubscribe?: UnsubKind }) {
  let status = "logged";
  // Optional emails carry a one-click unsubscribe (header for Gmail/Yahoo, plus a link in the text).
  const unsub = opts.unsubscribe && opts.userId ? unsubToken(opts.userId, opts.unsubscribe, opts.to) : null;
  if (unsub) opts = { ...opts, body: `${opts.body}\n\n—\nStop these emails: ${APP_URL}/unsubscribe/${unsub}` };
  // Staging (Vercel previews) never emails real people: everything goes to STAGING_EMAIL_TO, or nowhere.
  const staging = isPreview;
  const stagingTo = staging ? (process.env.STAGING_EMAIL_TO ?? "").trim() : "";
  if (staging) {
    opts = { ...opts, subject: `[Staging → ${opts.to}] ${opts.subject}`, to: stagingTo || opts.to };
    if (!stagingTo) status = "logged (staging)";
  }
  if (env.email.resendKey && !(staging && !stagingTo)) {
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
          ...(unsub
            ? { headers: { "List-Unsubscribe": `<${APP_URL}/api/unsubscribe/${unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
            : {}),
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
  if (status.startsWith("failed")) await recordIncident("email_failed", `Email to ${opts.to.replace(/^(.{2}).*@/, "$1…@")} ${status}`, opts.subject);
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
