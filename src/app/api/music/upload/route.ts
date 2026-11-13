import { NextResponse } from "next/server";
import { currentDeskForChange } from "@/lib/auth";
import { IntakeError } from "@/lib/intake";
import { startLibraryUpload } from "@/lib/library";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Projects, step 1: returns where to upload a WAV/MP3; the bytes go straight to storage (src/lib/library.ts). */
export async function POST(req: Request) {
  const u = await currentDeskForChange();
  if (u instanceof Response) return u;
  if (!u) return bad("Sign in again.", 401);
  // On a team desk, adding to Projects is for the owner and admins; members listen.
  if (u.role === "member") return bad("Only the owner or an A&R / Admin can add tracks here.", 403);
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    const r = await startLibraryUpload(u, {
      fileName: String(body.fileName ?? ""),
      size: Number(body.size),
      title: String(body.title ?? ""),
      artist: String(body.artist ?? ""),
      genre: String(body.genre ?? ""),
      rights: body.rights === true,
      // The project to add it to (checked as theirs in startLibraryUpload); none means in no project.
      folderId: body.folderId == null || body.folderId === "" ? null : Number(body.folderId),
    });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof IntakeError) return bad(e.message, e.status);
    console.error("[music-upload:start]", e);
    return bad("Couldn't start the upload. Nothing was saved. Try again.", 500);
  }
}
