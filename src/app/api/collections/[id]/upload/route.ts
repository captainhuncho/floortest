import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { IntakeError, startOwnerUpload } from "@/lib/intake";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Owner upload, step 1: the signed-in owner adds a WAV/MP3 to one of their own collections. Returns where to upload
 * it; the bytes go straight to storage. Ownership is checked here and again at /complete. Nobody else can use this:
 * everyone else sends through the owner's link.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/collections/[id]/upload">) {
  const u = await currentUser();
  if (!u) return bad("Sign in again.", 401);
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    const r = await startOwnerUpload(u, Number((await ctx.params).id) || 0, {
      fileName: String(body.fileName ?? ""),
      size: Number(body.size),
      title: String(body.title ?? ""),
      artist: String(body.artist ?? ""),
      genre: String(body.genre ?? ""),
      rights: body.rights === true,
    });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof IntakeError) return bad(e.message, e.status);
    console.error("[owner-upload:start]", e);
    return bad("Something went wrong. Please try again.", 500);
  }
}
