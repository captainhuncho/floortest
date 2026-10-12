import { NextResponse } from "next/server";
import { completeUpload, IntakeError } from "@/lib/intake";
import { SCAN_UNAVAILABLE } from "@/lib/scan";
import { userByHandle } from "@/lib/desk";
import { recordIncident } from "@/lib/incidents";
import { readAnalysis } from "@/lib/submission";

/** Room for the virus check of a large file (src/lib/scan.ts) on top of the usual checks. */
export const maxDuration = 60;

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Step 2: the file is in storage. Validate it and create the track. Body: { uploadId, duration?, bpm?, peaks? }. */
export async function POST(req: Request, ctx: RouteContext<"/api/submit/[handle]/complete">) {
  const receiver = await userByHandle((await ctx.params).handle);
  if (!receiver) return bad("Receiver not found", 404);
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Could not read the request.");
  }
  try {
    const track = await completeUpload(receiver, String(body.uploadId ?? ""), readAnalysis(body));
    return NextResponse.json({ token: track.token });
  } catch (e) {
    if (e instanceof IntakeError) {
      // A refused file (not audio, wrong size, expired): logged so "why didn't my track arrive?" has an answer.
      await recordIncident("upload_rejected", `Upload to @${receiver.handle} refused (${e.status})`, e.message, "/api/submit/complete");
      const res = bad(e.message, e.status);
      // The virus check couldn't run; the file is kept, so the browser asks again shortly (useTrackUpload).
      if (e.message === SCAN_UNAVAILABLE) res.headers.set("Retry-After", "10");
      return res;
    }
    console.error("[submit:complete]", e);
    await recordIncident("upload_failed", `Upload to @${receiver.handle} failed`, e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/submit/complete");
    return bad("Upload failed. Please try again.", 500);
  }
}
