import { after } from "next/server";
import "server-only";
import { unsubToken, type UnsubKind } from "./unsubscribe";
import crypto from "node:crypto";
import { now, q, type Queryable } from "./db";
import { env, isPreview } from "./env";
import { recordIncident } from "./incidents";
import { emailHtml } from "./email-html";
import { MAIL_LIMITS, MAIL_RESERVED_SHARE, MAIL_WARN_AT } from "./mail-quota";

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

/**
 * `reserved`: an account email (sign-in code, password reset, email check, email change) or a security notice (password,
 * two-step, passkey or Google sign-in changed, new sign-in, account deleted). Only these may use the part of
 * the day's send limit kept back (MAIL_RESERVED_SHARE), so receipts and notifications can never starve them.
 */
type MailOpts = { userId: number | null; to: string; subject: string; body: string; audience?: Audience; unsubscribe?: UnsubKind; secrets?: (string | null | undefined)[]; reserved?: boolean };
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
 *
 * The scheduled emails (digests, reminders, expiry warnings) are queued with the change that marks them sent and left to
 * the queue (backend audit, Batch B, 28 Oct): a timeout is then retried under the same key instead of becoming a second
 * email. `/api/cron/mail` drains the queue every 10 minutes; the nightly clean-up drains it too, as a backstop.
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
    `INSERT INTO outbox (user_id, to_email, subject, body, status, audience, created_at, payload, idem_key, attempts, next_at, optional, reserved)
     VALUES (?,?,?,?,'queued',?,?,?,?,0,?,?,?) RETURNING id`,
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
    opts.reserved ? 1 : 0,
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

/**
 * Runs `task` after the response has gone back (or straight away, not waited for, outside a request). Errors are logged.
 * Public forms that email an address only if it belongs to someone use it for the whole lookup and send, so the answer
 * takes the same time either way and can't tell a visitor whose address it is.
 */
export function afterResponse(task: () => Promise<unknown>, label = "[mail] send failed; the queue will retry") {
  const run = () => task().then(() => undefined, (e) => console.error(label, e));
  try {
    after(run);
  } catch {
    void run();
  }
}

/** Sends a queued email after the response (or straight away outside a request). */
export function deliverLater(id: number) {
  afterResponse(() => deliver(id));
}

const startOfDay = (at: number) => {
  const d = new Date(at);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

/**
 * Resend stops sending for the day at the plan's cap (MAIL_DAILY_LIMIT). The last MAIL_RESERVED_SHARE of it (30% by
 * default) is kept for account emails (sign-in codes, resets, email checks): every other email (receipts, notifications,
 * digests) waits until after midnight UTC once the rest is used. Optional emails (the ones with an unsubscribe link) stop
 * at MAIL_WARN_AT if that comes first.
 */
async function overSharedPart(at: number, optional: boolean) {
  const share = optional ? Math.min(MAIL_WARN_AT, 1 - MAIL_RESERVED_SHARE) : 1 - MAIL_RESERVED_SHARE;
  const today = await q.count("SELECT COUNT(*) AS n FROM outbox WHERE status = 'sent' AND last_attempt_at >= ?", startOfDay(at));
  return today >= MAIL_LIMITS.day * share;
}

/** One notice a day that optional email is being held back. */
async function reportDeferred(at: number) {
  const day = new Date(startOfDay(at)).toISOString().slice(0, 10);
  const first = await q.get(
    `INSERT INTO app_state (key, value, updated_at) VALUES ('mail_deferred_day', ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE app_state.value <> excluded.value RETURNING key`,
    day,
    at,
  );
  if (first)
    await recordIncident(
      "email_failed",
      `Emails are waiting until tomorrow: the daily send limit (${MAIL_LIMITS.day}) is used up to the part kept for sign-in codes and resets`,
      `Receipts, notifications and digests wait for midnight UTC; sign-in codes, resets and email checks still go (the last ${Math.round(MAIL_RESERVED_SHARE * 100)}% of the day, MAIL_RESERVED_SHARE). Raise MAIL_DAILY_LIMIT after upgrading the Resend plan.`,
    );
}

/** Sends one queued email if it's due and nobody else is sending it. Returns its status. */
export async function deliver(id: number, { retry = true } = {}): Promise<string> {
  const at = now();
  // A send that crashed is picked up again only while it has attempts left; drainOutbox closes the rest.
  const row = await q.get<{ user_id: number | null; payload: string; idem_key: string; attempts: number; subject: string; optional: number; reserved: number }>(
    `UPDATE outbox SET status = 'sending', attempts = attempts + 1, last_attempt_at = ?
     WHERE id = ? AND payload IS NOT NULL AND ((status = 'queued' AND next_at <= ?) OR (status = 'sending' AND last_attempt_at < ? AND attempts < ?))
     RETURNING user_id, payload, idem_key, attempts, subject, optional, reserved`,
    at,
    id,
    at,
    at - STALE_SEND_MS,
    MAX_ATTEMPTS,
  );
  if (!row) return (await q.get<{ status: string }>("SELECT status FROM outbox WHERE id = ?", id))?.status ?? "missing";
  let p: Payload;
  try {
    p = JSON.parse(unseal(row.payload)) as Payload;
  } catch (e) {
    // Sealed with another APP_SECRET, or damaged: it can never be sent, so it mustn't hold up the queue.
    await q.run("UPDATE outbox SET status = 'failed (unreadable)', payload = NULL, next_at = NULL WHERE id = ?", id);
    await recordIncident("email_failed", "A queued email couldn't be read (was APP_SECRET changed?) and was dropped", `${row.subject}\n${e instanceof Error ? e.message : String(e)}`);
    return "failed (unreadable)";
  }
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
  const willSend = !suppressed && !!env.email.resendKey && !(isPreview && !stagingTo);
  if (willSend && !row.reserved && (await overSharedPart(at, !!row.optional))) {
    // Waiting isn't a failed attempt: it goes back as it was, due just after midnight UTC.
    await q.run("UPDATE outbox SET status = 'queued', attempts = attempts - 1, next_at = ? WHERE id = ?", startOfDay(at) + 86_400_000 + 5 * 60_000, id);
    await reportDeferred(at);
    return "queued (daily limit)";
  }
  if (suppressed) status = `skipped (${suppressed.reason} before)`;
  else if (willSend) {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${env.email.resendKey}`, "Content-Type": "application/json", "Idempotency-Key": `outbox-${row.idem_key}` },
        body: JSON.stringify({
          from: env.email.from,
          to,
          subject,
          text: p.body,
          html: emailHtml(p.subject, p.body, { optional: !!row.optional, reserved: !!row.reserved }),
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

/**
 * Sends what's due in the queue (new, retries, sends a crash interrupted). Called by the mail job every 10 minutes and by
 * the cleanup jobs. One email that throws never stops the rest; `until` (a Date.now() deadline) stops starting new sends.
 */
export async function drainOutbox(limit = 50, { until = Infinity } = {}) {
  const at = now();
  // A send that crashed on its last attempt has none left: closed and reported instead of tried a sixth time.
  const stuck = await q.all<{ subject: string }>(
    `UPDATE outbox SET status = 'failed (stuck)', payload = NULL, next_at = NULL
     WHERE status = 'sending' AND payload IS NOT NULL AND last_attempt_at < ? AND attempts >= ? RETURNING subject`,
    at - STALE_SEND_MS,
    MAX_ATTEMPTS,
  );
  for (const s of stuck) await recordIncident("email_failed", "An email was stuck mid-send after every attempt and was closed", s.subject);
  const due = await q.all<{ id: number }>(
    `SELECT id FROM outbox WHERE payload IS NOT NULL AND ((status = 'queued' AND next_at <= ?) OR (status = 'sending' AND last_attempt_at < ? AND attempts < ?))
     ORDER BY id LIMIT ?`,
    at,
    at - STALE_SEND_MS,
    MAX_ATTEMPTS,
    limit,
  );
  let sent = 0;
  let errors = 0;
  for (const { id } of due) {
    if (Date.now() >= until) break;
    try {
      if ((await deliver(id)) === "sent") sent++;
    } catch (e) {
      errors++;
      console.error("[mail] couldn't deliver outbox email", id, e);
    }
  }
  return { due: due.length, sent, ...(stuck.length ? { stuck: stuck.length } : {}), ...(errors ? { errors } : {}) };
}
