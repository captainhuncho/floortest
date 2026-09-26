import { NextResponse } from "next/server";
import { completeUpload, IntakeError, userByHandle } from "@/lib/core";

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
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v > lo && v < hi ? v : null);
  const peaks =
    Array.isArray(body.peaks) && body.peaks.length <= 400 && body.peaks.every((v) => typeof v === "number" && Number.isFinite(v))
      ? (body.peaks as number[]).map((v) => Math.min(1, Math.max(0, v)))
      : null;
  try {
    const track = await completeUpload(receiver, String(body.uploadId ?? ""), {
      duration: num(body.duration, 0, 60 * 60 * 3),
      bpm: num(body.bpm, 40, 250),
      peaks,
    });
    return NextResponse.json({ token: track.token });
  } catch (e) {
    if (e instanceof IntakeError) return bad(e.message, e.status);
    console.error("[submit:complete]", e);
    return bad("Upload failed. Please try again.", 500);
  }
}
