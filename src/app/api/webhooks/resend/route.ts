import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { readLimited } from "@/lib/body-limit";
import { now, q } from "@/lib/db";
import { recordIncident } from "@/lib/incidents";
import { normalEmail } from "@/lib/email-normal";
import { nextDelivery } from "@/lib/email-delivery";

export const runtime = "nodejs";

/** Resend signs webhooks the Svix way; reports older than this are refused, so a captured one can't be replayed later. */
const TOLERANCE_S = 5 * 60;
const MAX_BYTES = 256_000;

function verified(secret: string, id: string, timestamp: string, body: string, signatures: string) {
  const ts = Number(timestamp);
  if (!id || !Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_S) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const want = Buffer.from(crypto.createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64"));
  return signatures.split(" ").some((s) => {
    const got = Buffer.from(s.split(",")[1] ?? "");
    return got.length === want.length && crypto.timingSafeEqual(got, want);
  });
}

type Report = { type: string; emailId: string; to: string; bounce: { type?: string; subType?: string; message?: string } | null };

/**
 * The parts of a report this route uses, checked for type. A report that fails (a number or object where text belongs,
 * say after a change on Resend's side) is recorded once with an incident and answered 200 "ignored": a crash or a non-2xx
 * answer would have Resend retry it for about a day and could get the endpoint switched off, stopping all tracking.
 * `to` is only a fallback for an email we can't find, so a bad one is dropped rather than failing the report.
 */
function readReport(raw: unknown): Report | null {
  const o = raw as { type?: unknown; data?: { email_id?: unknown; to?: unknown; bounce?: unknown } } | null;
  if (!o || typeof o !== "object" || typeof o.type !== "string") return null;
  const d = o.data;
  if (!d || typeof d !== "object" || typeof d.email_id !== "string") return null;
  const first = Array.isArray(d.to) ? d.to[0] : d.to;
  const to = typeof first === "string" ? first : "";
  let bounce: Report["bounce"] = null;
  if (d.bounce !== undefined && d.bounce !== null) {
    if (typeof d.bounce !== "object" || Array.isArray(d.bounce)) return null;
    const b = d.bounce as Record<string, unknown>;
    for (const k of ["type", "subType", "message"]) if (b[k] !== undefined && typeof b[k] !== "string") return null;
    bounce = { type: b.type as string | undefined, subType: b.subType as string | undefined, message: b.message as string | undefined };
  }
  return { type: o.type, emailId: d.email_id, to, bounce };
}

/**
 * Delivery reports from Resend: delivered, delayed, bounced or marked as spam. Each one updates its email on Admin → Emails.
 * Needs RESEND_WEBHOOK_SECRET. Each event (svix-id) is acted on once: it's recorded in the same transaction as its
 * changes, so a retried or replayed report changes nothing and raises no second incident (Codex review, 19 Oct).
 *
 * What each email shows (owner, 6 Nov: emails that arrived showed only "Bounced"):
 * - "delivered" stays once it's reported: a bounce that comes after it (often a forwarded copy failing at another
 *   mailbox) is kept as a note, not a new status, and doesn't stop email to the address;
 * - a soft bounce (Resend type Transient: mailbox full, server busy) is "soft_bounce" and stops nothing;
 * - a hard bounce on an email never delivered is "bounced" and stops further email to the address; a spam report is
 *   "complained" and stops optional email, as before.
 */
/** The delivery reports this route acts on, by Resend's event type. */
const REPORTS = { "email.delivered": "delivered", "email.delivery_delayed": "delayed", "email.bounced": "bounced", "email.complained": "complained" } as const;

/**
 * A report signed by Resend that we can't read. It's marked as seen only once its incident is saved, then answered 2xx
 * so Resend doesn't retry it. If the incident can't be saved, nothing is marked and the answer is 500, so Resend retries
 * and the incident is recorded on a later try (Safety review of #458).
 */
async function skipUnreadable(eventId: string, what: string) {
  const seen = await q.get("SELECT 1 FROM webhook_receipts WHERE provider = 'resend' AND event_id = ?", eventId);
  if (!seen) {
    if (!(await recordIncident("email_failed", what, "Check Resend's webhook format"))) return new NextResponse(null, { status: 500 });
    await q.run("INSERT INTO webhook_receipts (provider, event_id, received_at) VALUES ('resend', ?, ?) ON CONFLICT DO NOTHING", eventId, now());
  }
  return NextResponse.json({ ignored: true });
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new NextResponse(null, { status: 404 });
  // Delivery reports are a few KB; anything far bigger isn't one, so it isn't read in full first.
  const body = await readLimited(req, MAX_BYTES);
  if (body === null) return new NextResponse(null, { status: 413 });
  const h = req.headers;
  if (!verified(secret, h.get("svix-id") ?? "", h.get("svix-timestamp") ?? "", body, h.get("svix-signature") ?? "")) return new NextResponse(null, { status: 401 });

  const eventId = h.get("svix-id") ?? "";
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return skipUnreadable(eventId, "A report from Resend wasn't readable, so it was skipped.");
  }
  const kind = typeof (parsed as { type?: unknown })?.type === "string" ? (parsed as { type: string }).type : "";
  const delivery = Object.hasOwn(REPORTS, kind) ? REPORTS[kind as keyof typeof REPORTS] : undefined;
  if (!delivery) return NextResponse.json({ ignored: true });
  const e = readReport(parsed);
  if (!e || !e.emailId) return skipUnreadable(eventId, `A ${kind} report from Resend wasn't in the expected shape, so it was skipped.`);
  const id = e.emailId;
  const to = e.to;
  const bounce = e.bounce;
  const soft = delivery === "bounced" && (bounce?.type ?? "Permanent").toLowerCase() === "transient";
  const detail = delivery === "bounced" ? [soft ? "Soft bounce" : "Bounce", bounce?.subType, bounce?.message].filter(Boolean).join(": ").slice(0, 300) : "";
  const done = await q.tx(async (db) => {
    const fresh = await db.get("INSERT INTO webhook_receipts (provider, event_id, received_at) VALUES ('resend', ?, ?) ON CONFLICT DO NOTHING RETURNING event_id", h.get("svix-id"), now());
    if (!fresh) return null;
    const row = await db.get<{ id: number; to_email: string; subject: string; delivery: string; delivered_at: number | null }>(
      "SELECT id, to_email, subject, delivery, delivered_at FROM outbox WHERE provider_id = ? FOR UPDATE",
      id,
    );
    const deliveredBefore = !!row?.delivered_at || row?.delivery === "delivered";
    const next = row ? nextDelivery(row.delivery, deliveredBefore, delivery as "delivered" | "delayed" | "bounced" | "complained", soft) : null;
    if (row && next)
      await db.run(
        "UPDATE outbox SET delivery = ?, delivery_at = ?, delivered_at = CASE WHEN ? = 'delivered' THEN COALESCE(delivered_at, ?) ELSE delivered_at END WHERE id = ?",
        next, now(), next, now(), row.id,
      );
    // The reason stays on the email either way, so a bounce after delivery is still visible.
    if (row && detail)
      await db.run("UPDATE outbox SET delivery_detail = ? WHERE id = ?", deliveredBefore ? `After delivery: ${detail}`.slice(0, 300) : detail, row.id);
    // Stop email to the address only for a hard bounce on an email that never arrived, or a spam report.
    const reason = delivery === "complained" ? "complained" : delivery === "bounced" && !soft && !deliveredBefore ? "bounced" : null;
    const email = normalEmail(row?.to_email ?? to);
    if (email && reason)
      await db.run(
        // A hard bounce on an address already blocked for a spam report makes it a full block: a spam report still lets
        // sign-in codes and resets through, which would keep going to an address that no longer exists.
        "INSERT INTO email_suppressions (email, reason, detail, created_at) VALUES (?,?,?,?) ON CONFLICT (email) DO UPDATE SET reason = 'bounced', detail = excluded.detail WHERE email_suppressions.reason = 'complained' AND excluded.reason = 'bounced'",
        email,
        reason,
        (bounce?.message ?? "").slice(0, 300),
        now(),
      );
    return { email, subject: row?.subject ?? "", reason };
  });
  if (!done) return NextResponse.json({ duplicate: true });
  if (done.email && done.reason)
    await recordIncident(
      "email_failed",
      `${done.reason === "complained" ? "Marked as spam" : "Bounced"}: ${done.email.replace(/^(.{2}).*@/, "$1…@")}. No more email goes to this address.`,
      done.subject,
    );
  return NextResponse.json({ ok: true });
}
