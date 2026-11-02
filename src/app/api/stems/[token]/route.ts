import { NextResponse } from "next/server";
import { senderProvenFor, NOT_AVAILABLE } from "@/lib/receipt-proof";
import { IntakeError } from "@/lib/intake";
import { ipFrom } from "@/lib/ratelimit";
import { startStemUpload } from "@/lib/stems";

export const runtime = "nodejs";

/** Step 1 of a stem upload from the sender's receipt page. Body: { fileName, size }. */
export async function POST(req: Request, ctx: RouteContext<"/api/stems/[token]">) {
  // Only the receipt's sender, proven on the server (src/lib/receipt-proof.ts); anyone else gets the unknown-link answer.
  if (!(await senderProvenFor((await ctx.params).token))) return NextResponse.json({ error: NOT_AVAILABLE }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { fileName?: unknown; size?: unknown };
  try {
    const res = await startStemUpload((await ctx.params).token, String(body.fileName ?? "").slice(0, 255), Number(body.size), ipFrom(req.headers));
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof IntakeError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("[stems:start]", e);
    return NextResponse.json({ error: "Couldn't start the upload. Nothing was sent. Try again." }, { status: 500 });
  }
}
