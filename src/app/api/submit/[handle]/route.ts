import { NextResponse } from "next/server";
import { senderProfiles } from "@/lib/socials";
import { currentUser } from "@/lib/auth";
import { IntakeError, startUpload } from "@/lib/intake";
import { userByHandle } from "@/lib/desk";
import { q } from "@/lib/db";
import { folderLimit } from "@/lib/plan-store";
import { cleanGenre, MIX_STATUS, AI_USE, RELEASE_STATUS } from "@/lib/plans";
import { ipFrom } from "@/lib/ratelimit";
import { confirmedEmail } from "@/lib/sender-code";

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
  // Release: an EP or album sent as a folder. Only the first track passes the bot check; later ones can only join a
  // release that same sender already started.
  const rel = body.release && typeof body.release === "object" ? (body.release as Record<string, unknown>) : null;
  const release = rel && typeof rel.id === "string" && /^[A-Za-z0-9_-]{16,40}$/.test(rel.id)
    ? {
        id: rel.id,
        title: String(rel.title ?? "").trim().slice(0, 200),
        artist: String(rel.artist ?? "").trim().slice(0, 200),
        kind: (String(rel.kind) === "album" ? "album" : "ep") as "ep" | "album",
      }
    : null;
  if (body.release && !release) return bad("Something's wrong with this release. Please start again.");
  // EPs and albums go only to receivers whose plan accepts folders (Pro and Team); the size cap is checked at upload.
  if (release && !(await folderLimit(receiver.plan))) return bad(`${receiver.name} can receive up to 3 tracks at a time. Send the tracks one by one.`, 403);
  // Up to 3 tracks sent together share a batch (one send, 250 MB between them).
  const batch = !release && typeof body.batch === "string" && /^[A-Za-z0-9_-]{16,40}$/.test(body.batch) ? body.batch : null;
  if (account && account.id === receiver.id) return bad("That's your own link. Share it with others to receive music.");
  const name = account ? account.name : str("name", 100);
  const email = account ? account.email.toLowerCase() : str("email", 200).toLowerCase();
  // Without an account, the email must be confirmed with a code first (which is also where the bot check happens).
  if (!account && (await confirmedEmail()) !== email) return NextResponse.json({ error: "Confirm your email first.", needsCode: true }, { status: 401 });
  const title = str("title", 200);
  const genre = cleanGenre(String(body.genre ?? ""));
  const fileName = str("fileName", 255);
  const size = Number(body.size);

  if (!fileName) return bad("Choose a WAV or MP3 file.");
  if (!title) return bad("Add a track title.");
  if (!genre) return bad("Choose a genre.");
  if (!pick("mix_status", MIX_STATUS)) return bad("Choose a mix status.");
  if (!pick("release_status", RELEASE_STATUS)) return bad("Choose a release status.");
  if (!name) return bad("Add your name.");
  // Senders without an account give their Instagram and/or a streaming profile; account senders have none here.
  const profiles = account ? { links: [] } : senderProfiles(str("sender_instagram", 300), str("sender_streaming", 300));
  if ("error" in profiles) return bad(profiles.error);
  if (!str("artist", 200)) return bad("Add the artist.");
  if (!Object.hasOwn(AI_USE, str("ai_use", 20))) return bad("Say whether you used AI to make this track.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Enter a valid email so we can tell you what happens next.");

  try {
    const res = await startUpload(
      receiver,
      {
        name,
        email,
        title,
        artist: str("artist", 200),
        message: str("message", 2000),
        releaseStatus: pick("release_status", RELEASE_STATUS),
        aiUse: pick("ai_use", AI_USE),
        senderLinks: JSON.stringify(profiles.links),
        mixStatus: pick("mix_status", MIX_STATUS),
        genre,
        originalName: fileName,
        setsOk: body.sets_ok === true,
        ...(release ? { release } : batch ? { batch } : {}),
        trackNo: Number.isInteger(Number(body.track_no)) && Number(body.track_no) >= 1 && Number(body.track_no) <= 99 ? Number(body.track_no) : null,
        musicalKey: str("musical_key", 12),
        isrc: /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(str("isrc", 12).toUpperCase().replace(/-/g, "")) ? str("isrc", 12).toUpperCase().replace(/-/g, "") : "",
        ...(account ? { accountId: account.id, emailConfirmed: !!account.email_verified_at } : { emailConfirmed: true }),
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
