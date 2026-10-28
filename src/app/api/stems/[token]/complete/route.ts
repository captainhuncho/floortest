import { NextResponse } from "next/server";
import { IntakeError, UploadHeld } from "@/lib/intake";
import { completeStemUpload } from "@/lib/stems";

/** Room for the virus check of a large file (src/lib/scan.ts, up to 45 s in the request; a sleeping scanner means the stem is held instead). */
export const maxDuration = 90;

export const runtime = "nodejs";

/**
 * Step 2: the stem is in storage. Validate it and attach it to the track. Body: { uploadId }. 202 { held: true } when the
 * virus scanner is asleep or down: the stem is kept and attached within about 10 minutes (src/lib/held-uploads.ts).
 */
export async function POST(req: Request, ctx: RouteContext<"/api/stems/[token]/complete">) {
  const body = (await req.json().catch(() => ({}))) as { uploadId?: unknown };
  try {
    const stem = await completeStemUpload((await ctx.params).token, String(body.uploadId ?? ""));
    return NextResponse.json({ name: stem.name, size: stem.size });
  } catch (e) {
    if (e instanceof UploadHeld) return NextResponse.json({ held: true, message: e.message }, { status: 202 });
    if (e instanceof IntakeError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[stems:complete]", e);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
