import { after } from "next/server";
import "server-only";
import { unsubToken, type UnsubKind } from "./unsubscribe";
import crypto from "node:crypto";
import { now, q, type Queryable } from "./db";
import { env, isPreview } from "./env";
import { recordIncident } from "./incidents";

export const APP_URL = env.appUrl;

export type Audience = "sender" | "receiver" | "support";

/**
 * Text a sender typed (their name, a title), made safe to put in our emails: web links and bare domains become
 * "[link removed]", so FloorTest's address can't be used to deliver someone's phishing link.
 */
export function noLinks(s: string) {
  return s
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link removed]")
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|io|co|app|ly|me|xyz|info|biz|link|click|top|site|online|ru|cn|tk|gq|ml|ga|cf)\b\S*/gi, "[link removed]")
    .slice(0, 200);
}

/** Stands in for a sign-in code or private link in the stored copy of an email. */
export const HIDDEN = "•••••• (hidden)";

type MailOpts = { userId: number | null; to: string; subject: string; body: string; audience?: Audience; unsubscribe?: UnsubKind; secrets?: (string | null | undefined)[] };
type Payload = { to: string; subject: string; body: string; unsub: string | null };

/*
 * The outbox is also the send queue (Codex review, phase B item 4; 24 Oct). Every email is written to `outbox` before
 * it is sent: the stored copy with codes and private links HIDDEN (`subject`, `body`, read by ops and on Settings →
 * Notifications), and the real text sealed with a key from APP_SECRET (`payload`), which is erased as soon as the email
 * has gone or given up. Each row carries its own Resend idempotency key, so a crash between Resend accepting it and us
 * recording that can't send it twice (Resend keeps keys 24 hours; retries end well inside that).
 *
 *   sendMail       one attempt now, result returned (sign-in codes, and callers that decide themselves what to do next)
 *   sendMailLater  queued now, sent after the response, retried by `drainOutbox` with back-off if it fails
 *   queueMail      the same queue inside the caller's transaction, so the email exists only if the change it reports does
 */
const MAX_ATTEMPTS = 5;
const BACKOFF_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000];
/** A send that started but never recorded its result (a crash) is tried again after this; the idempotency key stops a repeat. */
const STALE_SEND_MS = 2 * 60_000;

const outboxKey = () => crypto.createHash("sha256").update(`floortest-outbox:${env.secret}`).digest();
function seal(plain: string) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", outboxKey(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), body].map((b) => b.toString("base64url")).join(".");
}
function unseal(sealed: string) {
  const [iv, tag, body] = sealed.split(".").map((p) => Buffer.from(p, "base64url"));
  const d = crypto.createDecipheriv("aes-256-gcm", outboxKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(body), d.final()]).toString("utf8");
}

/**
 * Writes the email to the outbox, ready to send; returns its id. With `db`, inside the caller's transaction.
 * `secrets`: sign-in codes, tokens and private links in this email. The email goes out with them; the stored copy and
 * any failure incident show them as HIDDEN, so reading the Email log never hands anyone a way into an account or receipt.
 */
export async function queueMail(opts: MailOpts, db: Queryable = q): Promise<number> {
  const secrets = (opts.secrets ?? []).filter((s): s is string => !!s && s.length >= 4);
  const hide = (s: string) => secrets.reduce((out, x) => out.split(x).join(HIDDEN), s);
  // Optional emails carry a one-click unsubscribe (header for Gmail/Yahoo, plus a link in the text).
  const unsub = opts.unsubscribe && opts.userId ? unsubToken(opts.userId, opts.unsubscribe, opts.to) : null;
  const body = unsub ? `${opts.body}\n\n—\nStop these emails: ${APP_URL}/unsubscribe/${unsub}` : opts.body;
  const payload: Payload = { to: opts.to, subject: opts.subject, body, unsub };
  const at = now();
  const row = await db.get<{ id: number }>(
    `INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at, payload, idem_key, attempts, next_at, optional)
     VALUES (?,?,?,?,'queued',?,?,?,?,0,?,?) RETURNING id`,
    opts.userId,
    opts.to,
    hide(opts.subject),
    hide(body),
    opts.audience ?? "sender",
    at,
    seal(JSON.stringify(payload)),
    crypto.randomUUID(),
    at,
    opts.unsubscribe ? 1 : 0,
  );
  return row!.id;
}

/** One attempt now; the result is returned and nothing is retried (the caller decides). */
export async function sendMail(opts: MailOpts) {
  return deliver(await queueMail(opts), { retry: false });
}

/**
 * Queued now, sent after the response has gone back, so a slow or failing email service never makes someone wait.
 * Retried by the worker if it fails or if the server stops before sending.
 */
export async function sendMailLater(opts: MailOpts) {
  deliverLater(await queueMail(opts));
}

/** Sends a queued email after the response (or straight away outside a request). */
export function deliverLater(id: number) {
  const run = () => deliver(id).then(() => undefined, (e) => console.error("[mail] send failed; the queue will retry", e));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Sends one queued email if it's due and nobody else is sending it. Returns its status. */
export async function deliver(id: number, { retry = true } = {}): Promise<string> {
  const at = now();
  const row = await q.get<{ user_id: number | null; payload: string; idem_key: string; attempts: number; subject: string; optional: number }>(
    `UPDATE outbox SET status = 'sending', attempts = attempts + 1, last_attempt_at = ?
     WHERE id = ? AND payload IS NOT NULL AND ((status = 'queued' AND next_at <= ?) OR (status = 'sending' AND last_attempt_at < ?))
     RETURNING user_id, payload, idem_key, attempts, subject, optional`,
    at,
    id,
    at,
    at - STALE_SEND_MS,
  );
  if (!row) return (await q.get<{ status: string }>("SELECT status FROM outbox WHERE id = ?", id))?.status ?? "missing";
  const p = JSON.parse(unseal(row.payload)) as Payload;
  let to = p.to;
  let subject = p.subject;
  let status = "logged";
  let providerId: string | null = null;
  // An address that bounced for good gets nothing more; one that reported us as spam still gets what it asks for
  // (sign-in codes, resets) but no optional email. Admin → Emails can lift either.
  const block = await q.get<{ reason: string }>("SELECT reason FROM email_suppressions WHERE email = ?", p.to.trim().toLowerCase()).catch(() => undefined);
  const suppressed = block && (block.reason === "bounced" || row.optional) ? block : undefined;
  // Staging (Vercel previews) never emails real people: everything goes to STAGING_EMAIL_TO, or nowhere.
  const stagingTo = isPreview ? (process.env.STAGING_EMAIL_TO ?? "").trim() : "";
  if (isPreview) {
    subject = `[Staging → ${p.to}] ${subject}`;
    to = stagingTo || p.to;
    if (!stagingTo) status = "logged (staging)";
  }
  if (suppressed) status = `skipped (${suppressed.reason} before)`;
  else if (env.email.resendKey && !(isPreview && !stagingTo)) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.email.resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `outbox-${row.idem_key}` },
        body: JSON.stringify({
          from: env.email.from,
          to,
          subject,
          text: p.body,
          ...(env.email.replyTo ? { reply_to: env.email.replyTo } : {}),
          ...(p.unsub
            ? { headers: { "List-Unsubscribe": `<${APP_URL}/api/unsubscribe/${p.unsub}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" } }
            : {}),
        }),
        signal: AbortSignal.timeout(5_000),
      });
      status = res.ok ? "sent" : `failed (${res.status})`;
      if (res.ok) providerId = ((await res.json().catch(() => ({}))) as { id?: string }).id ?? null;
      else console.error("[mail] Resend rejected", res.status, await res.text().catch(() => ""));
    } catch (e) {
      status = "failed (network)";
      console.error("[mail] delivery failed", e);
    }
  }
  if (status.startsWith("failed") && retry && row.attempts < MAX_ATTEMPTS) {
    await q.run("UPDATE outbox SET status = 'queued', next_at = ? WHERE id = ?", at + BACKOFF_MS[row.attempts - 1], id);
    return "queued (retrying)";
  }
  // Final: the sealed text goes, only the hidden copy stays.
  await q.run("UPDATE outbox SET status = ?, provider_id = ?, payload = NULL, next_at = NULL WHERE id = ?", status, providerId, id);
  if (status.startsWith("failed")) await recordIncident("email_failed", `Email to ${p.to.replace(/^(.{2}).*@/, "$1…@")} ${status}`, row.subject);
  return status;
}

/** Sends what's due in the queue (new, retries, sends a crash interrupted). Called by the cleanup jobs. */
export async function drainOutbox(limit = 50) {
  const at = now();
  const due = await q.all<{ id: number }>(
    `SELECT id FROM outbox WHERE payload IS NOT NULL AND ((status = 'queued' AND next_at <= ?) OR (status = 'sending' AND last_attempt_at < ?))
     ORDER BY id LIMIT ?`,
    at,
    at - STALE_SEND_MS,
    limit,
  );
  let sent = 0;
  for (const { id } of due) if ((await deliver(id)) === "sent") sent++;
  return { due: due.length, sent };
}
