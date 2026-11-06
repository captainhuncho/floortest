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

type Event = { type?: string; data?: { email_id?: string; to?: string[] | string; bounce?: { type?: string; subType?: string; message?: string } } };

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
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new NextResponse(null, { status: 404 });
  // Delivery reports are a few KB; anything far bigger isn't one, so it isn't read in full first.
  const body = await readLimited(req, MAX_BYTES);
  if (body === null) return new NextResponse(null, { status: 413 });
  const h = req.headers;
  if (!verified(secret, h.get("svix-id") ?? "", h.get("svix-timestamp") ?? "", body, h.get("svix-signature") ?? "")) return new NextResponse(null, { status: 401 });

  let e: Event;
  try {
    e = JSON.parse(body);
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  const delivery = { "email.delivered": "delivered", "email.delivery_delayed": "delayed", "email.bounced": "bounced", "email.complained": "complained" }[e.type ?? ""];
  const id = e.data?.email_id;
  if (!delivery || !id) return NextResponse.json({ ignored: true });

  const to = (Array.isArray(e.data?.to) ? e.data?.to[0] : e.data?.to) ?? "";
  const bounce = e.data?.bounce;
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
        "INSERT INTO email_suppressions (email, reason, detail, created_at) VALUES (?,?,?,?) ON CONFLICT (email) DO NOTHING",
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
