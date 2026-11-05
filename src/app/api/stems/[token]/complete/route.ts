import { NextResponse } from "next/server";
import { senderProvenFor, NOT_AVAILABLE } from "@/lib/receipt-proof";
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
  const uploadId = String(body.uploadId ?? "");
  // A stem started while the receipt was open finishes even after it closes (owner, 4 Nov); proof still applies.
  if (!(await senderProvenFor((await ctx.params).token, { stemUpload: uploadId }))) return NextResponse.json({ error: NOT_AVAILABLE }, { status: 404 });
  try {
    const stem = await completeStemUpload((await ctx.params).token, uploadId);
    return NextResponse.json({ name: stem.name, size: stem.size });
  } catch (e) {
    if (e instanceof UploadHeld) return NextResponse.json({ held: true, message: e.message }, { status: 202 });
    if (e instanceof IntakeError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[stems:complete]", e);
    return NextResponse.json({ error: "The stem arrived but couldn't be saved, so nothing was sent. Upload it again." }, { status: 500 });
  }
}
