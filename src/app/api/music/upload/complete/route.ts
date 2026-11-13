import { NextResponse } from "next/server";
import { currentDeskForChange } from "@/lib/auth";
import { IntakeError, UploadHeld } from "@/lib/intake";
import { completeLibraryUpload } from "@/lib/library";
import { readAnalysis } from "@/lib/submission";

/** Room for the virus check of a large file (src/lib/scan.ts, up to 45 s in the request; a sleeping scanner means the file is held instead). */
export const maxDuration = 90;

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Projects, step 2: the file is in storage. Checked like any send (real audio, right size, virus check), then added. */
export async function POST(req: Request) {
  const u = await currentDeskForChange();
  if (u instanceof Response) return u;
  if (!u) return bad("Sign in again.", 401);
  // On a team desk, adding to Projects is for the owner and admins; members listen.
  if (u.role === "member") return bad("Only the owner or an A&R / Admin can add tracks here.", 403);
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  try {
    const row = await completeLibraryUpload(u, String(body.uploadId ?? ""), readAnalysis(body));
    return NextResponse.json({ id: row.id });
  } catch (e) {
    if (e instanceof UploadHeld) return NextResponse.json({ held: true, message: e.message }, { status: 202 });
    if (e instanceof IntakeError) return bad(e.message, e.status);
    console.error("[music-upload:complete]", e);
    return bad("The file arrived but couldn't be saved, so nothing was added. Upload it again.", 500);
  }
}
