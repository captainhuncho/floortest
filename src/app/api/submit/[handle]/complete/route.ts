import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { completeUpload, IntakeError, UploadHeld } from "@/lib/intake";
import { userByHandle } from "@/lib/desk";
import { recordIncident } from "@/lib/incidents";
import { readAnalysis } from "@/lib/submission";
import { q } from "@/lib/db";
import { RECEIPT_COOKIE } from "@/lib/receipt-proof-core";
import { RECEIPT_COOKIE_OPTIONS, rememberedValue } from "@/lib/receipt-proof";

/** Room for the virus check of a large file (src/lib/scan.ts, up to 45 s in the request; a sleeping scanner means the file is held instead). */
export const maxDuration = 90;

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Step 2: the file is in storage. Validate it and create the track. Body: { uploadId, duration?, bpm?, peaks? }. */
export async function POST(req: Request, ctx: RouteContext<"/api/submit/[handle]/complete">) {
  const receiver = await userByHandle((await ctx.params).handle);
  if (!receiver) return bad("No one has this link. Check the address with the person who shared it.", 404);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("The upload didn't finish properly. Reload the page and press Send again.");
  }
  try {
    const track = await completeUpload(receiver, String(body.uploadId ?? ""), readAnalysis(body));
    const res = NextResponse.json({ token: track.token });
    // The browser it was sent from may see the whole receipt for 30 days (src/lib/receipt-proof.ts): only this upload's
    // owner reaches here (the upload id is its secret, and starting it needed the confirmed email or the account).
    const sender = await q.get<{ id: number; email: string }>("SELECT id, email FROM senders WHERE id = ?", track.sender_id);
    if (sender) res.cookies.set(RECEIPT_COOKIE, rememberedValue((await cookies()).get(RECEIPT_COOKIE)?.value, sender), RECEIPT_COOKIE_OPTIONS);
    return res;
  } catch (e) {
    // The virus scanner is asleep or down: the file is kept and checked in the next batch (src/lib/held-uploads.ts).
    if (e instanceof UploadHeld) return NextResponse.json({ held: true, message: e.message }, { status: 202 });
    if (e instanceof IntakeError) {
      // A refused file (not audio, wrong size, expired): logged so "why didn't my track arrive?" has an answer.
      await recordIncident("upload_rejected", `Upload to @${receiver.handle} refused (${e.status})`, e.message, "/api/submit/complete");
      return bad(e.message, e.status);
    }
    console.error("[submit:complete]", e);
    await recordIncident("upload_failed", `Upload to @${receiver.handle} failed`, e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/submit/complete");
    return bad("Your track arrived but couldn't be saved, so nothing was sent. Press Send again: your details are still here.", 500);
  }
}
