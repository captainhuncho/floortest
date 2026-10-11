import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { completeUpload, IntakeError } from "@/lib/intake";
import { readAnalysis } from "@/lib/submission";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Owner upload, step 2: the file is in storage. Checked like any send (real audio, right size), then added to the collection. */
export async function POST(req: Request, ctx: RouteContext<"/api/collections/[id]/upload/complete">) {
  const u = await currentUser();
  if (!u) return bad("Sign in again.", 401);
  // On a team desk, adding tracks is for the owner and admins; members review.
  if (u.role === "member") return bad("Only the owner or an A&R / Admin can add tracks here.", 403);
  const id = Number((await ctx.params).id) || 0;
  if (!(await q.get("SELECT 1 FROM collections WHERE id = ? AND user_id = ?", id, u.id))) return bad("Not found", 404);
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    const track = await completeUpload(u, String(body.uploadId ?? ""), readAnalysis(body));
    return NextResponse.json({ id: track.id });
  } catch (e) {
    if (e instanceof IntakeError) return bad(e.message, e.status);
    console.error("[owner-upload:complete]", e);
    return bad("Upload failed. Please try again.", 500);
  }
}
