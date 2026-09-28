import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { IntakeError, startUpload, userByHandle } from "@/lib/core";
import { cleanGenre, MIX_STATUS, RELEASE_STATUS } from "@/lib/plans";
import { ipFrom } from "@/lib/ratelimit";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

/**
 * Step 1 of a submission. JSON body with the sender's details and the file's name and size.
 * Returns where to upload the file; the bytes go straight to storage, never through here.
 */
export async function POST(req: Request, ctx: RouteContext<"/api/submit/[handle]">) {
  const receiver = await userByHandle((await ctx.params).handle);
  if (!receiver) return bad("Receiver not found", 404);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return bad("Could not read the submission.");
  }
  const str = (k: string, max: number) => String(body[k] ?? "").trim().slice(0, max);
  const pick = (k: string, allowed: object) => (Object.hasOwn(allowed, str(k, 20)) ? str(k, 20) : "");
  // Sending from a FloorTest account: name and email come from the account, not the form.
  const account = body.asAccount ? await currentUser() : null;
  if (body.asAccount && !account) return bad("Sign in again to send from your account.", 401);
  if (account && account.id === receiver.id) return bad("That's your own link. Share it with others to receive music.");
  const name = account ? account.name : str("name", 100);
  const email = account ? account.email.toLowerCase() : str("email", 200).toLowerCase();
  const title = str("title", 200);
  const genre = cleanGenre(String(body.genre ?? ""));
  const fileName = str("fileName", 255);
  const size = Number(body.size);

  if (!fileName) return bad("Choose a WAV or MP3 file.");
  if (!title) return bad("Add a track title.");
  if (!genre) return bad("Choose a genre.");
  if (!name) return bad("Add your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Enter a valid email so we can tell you what happens next.");

  try {
    const res = await startUpload(
      receiver,
      {
        name,
        email,
        title,
        artist: str("artist", 200) || name,
        message: str("message", 2000),
        releaseStatus: pick("release_status", RELEASE_STATUS),
        mixStatus: pick("mix_status", MIX_STATUS),
        genre,
        originalName: fileName,
        ...(account ? { accountId: account.id, accountVerified: !!account.email_verified_at } : {}),
      },
      size,
      ipFrom(req.headers),
    );
    return NextResponse.json(res);
  } catch (e) {
    if (e instanceof IntakeError) return bad(e.message, e.status);
    console.error("[submit:start]", e);
    return bad("Something went wrong. Please try again.", 500);
  }
}
