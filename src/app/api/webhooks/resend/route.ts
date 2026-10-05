import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { now, q } from "@/lib/db";
import { recordIncident } from "@/lib/incidents";

export const runtime = "nodejs";

/** Resend signs webhooks the Svix way; reports older than this are refused, so a captured one can't be replayed later. */
const TOLERANCE_S = 5 * 60;

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
 * A permanent bounce or a spam report stops further email to that address. Needs RESEND_WEBHOOK_SECRET.
 */
export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return new NextResponse(null, { status: 404 });
  const body = await req.text();
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

  // A later "delayed" never overwrites a final result.
  const row = await q.get<{ id: number; to_email: string; subject: string }>(
    `UPDATE outbox SET delivery = ?, delivery_at = ? WHERE provider_id = ? AND (? <> 'delayed' OR delivery IN ('', 'delayed')) RETURNING id, to_email, subject`,
    delivery,
    now(),
    id,
    delivery,
  );
  const to = (row?.to_email ?? (Array.isArray(e.data?.to) ? e.data?.to[0] : e.data?.to) ?? "").trim().toLowerCase();
  const permanent = delivery === "bounced" && (e.data?.bounce?.type ?? "Permanent").toLowerCase() !== "transient";
  if (to && (permanent || delivery === "complained")) {
    const reason = delivery === "complained" ? "complained" : "bounced";
    await q.run(
      "INSERT INTO email_suppressions (email, reason, detail, created_at) VALUES (?,?,?,?) ON CONFLICT (email) DO NOTHING",
      to,
      reason,
      (e.data?.bounce?.message ?? "").slice(0, 300),
      now(),
    );
    await recordIncident(
      "email_failed",
      `${reason === "complained" ? "Marked as spam" : "Bounced"}: ${to.replace(/^(.{2}).*@/, "$1…@")}. No more email goes to this address.`,
      row?.subject ?? "",
    );
  }
  return NextResponse.json({ ok: true });
}
