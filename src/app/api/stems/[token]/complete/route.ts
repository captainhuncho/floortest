import { NextResponse } from "next/server";
import { IntakeError } from "@/lib/intake";
import { completeStemUpload } from "@/lib/stems";

/** Room for the virus check of a large file (src/lib/scan.ts) on top of the usual checks. */
export const maxDuration = 60;

export const runtime = "nodejs";

/** Step 2: the stem is in storage. Validate it and attach it to the track. Body: { uploadId }. */
export async function POST(req: Request, ctx: RouteContext<"/api/stems/[token]/complete">) {
  const body = (await req.json().catch(() => ({}))) as { uploadId?: unknown };
  try {
    const stem = await completeStemUpload((await ctx.params).token, String(body.uploadId ?? ""));
    return NextResponse.json({ name: stem.name, size: stem.size });
  } catch (e) {
    if (e instanceof IntakeError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[stems:complete]", e);
    return NextResponse.json({ error: "Upload failed. Please try again." }, { status: 500 });
  }
}
