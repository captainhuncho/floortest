import { NextResponse } from "next/server";
import { requireAdminQuiet } from "@/lib/admin";
import { allow } from "@/lib/ratelimit";
import { startProofUpload } from "@/lib/verification-proposals";

export const runtime = "nodejs";

const HOURLY = 60;
const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });

/**
 * Verification proof, step 1 (owner, 1 Nov): staff with "verification" get a link to put one file (≤ 10 MB) straight
 * into the private bucket under a random key, and a signed ticket the proposal form sends back. The file is checked
 * (size, real type) and moved when the proposal or verification is sent. src/lib/verification-proposals.ts.
 */
export async function POST(req: Request) {
  const admin = await requireAdminQuiet("verification");
  if (!admin) return notFound();
  // JSON only: a cross-site form can't send it without a preflight this route never allows.
  if (!req.headers.get("content-type")?.startsWith("application/json")) return NextResponse.json({ error: "Send JSON" }, { status: 415 });
  if (!(await allow("verification-proof", String(admin.id), HOURLY, 3_600_000)))
    return NextResponse.json({ error: "Too many uploads this hour. Try again later." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { size?: unknown; name?: unknown } | null;
  const r = await startProofUpload(admin.id, Number(body?.size), String(body?.name ?? "").slice(0, 300));
  if (!r.ok) return NextResponse.json({ error: r.why }, { status: 400 });
  return NextResponse.json({ ticket: r.ticket, url: r.url, headers: r.headers }, { headers: { "Cache-Control": "private, no-store" } });
}
