import { NextResponse } from "next/server";
import { parseLinks } from "@/lib/socials";
import { currentUser } from "@/lib/auth";
import { IntakeError, startUpload } from "@/lib/intake";
import { userByHandle } from "@/lib/desk";
import { q } from "@/lib/db";
import { folderLimit } from "@/lib/plan-store";
import { cleanGenre, MIX_STATUS, AI_USE, RELEASE_STATUS } from "@/lib/plans";
import { ipFrom } from "@/lib/ratelimit";
import { BOT_MESSAGE, passedTurnstile } from "@/lib/turnstile";

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
  // Up to 3 tracks sent together share a batch; like a release, later tracks join without a fresh bot check.
  const batch = !release && typeof body.batch === "string" && /^[A-Za-z0-9_-]{16,40}$/.test(body.batch) ? body.batch : null;
  const joining = release
    ? !!(await q.get("SELECT 1 FROM releases WHERE id = ? AND user_id = ?", release.id, receiver.id))
    : batch
      ? !!(await q.get("SELECT 1 FROM tracks WHERE user_id = ? AND batch_id = ?", receiver.id, batch))
      : false;
  if (!account && !joining && !(await passedTurnstile(body.turnstile, ipFrom(req.headers)))) return bad(BOT_MESSAGE, 403);
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
  const senderLinks = parseLinks(str("sender_links", 600).split(",").join("\n"));
  if (senderLinks.error) return bad(`Profile link: ${senderLinks.error}`);
  if (senderLinks.links.length > 3) return bad("Add up to 3 profile links.");
  if (!Object.hasOwn(AI_USE, str("ai_use", 20))) return bad("Say whether you used AI to make this track.");
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
        aiUse: pick("ai_use", AI_USE),
        senderLinks: JSON.stringify(senderLinks.links),
        mixStatus: pick("mix_status", MIX_STATUS),
        genre,
        originalName: fileName,
        setsOk: body.sets_ok === true,
        ...(release ? { release } : batch ? { batch } : {}),
        trackNo: Number.isInteger(Number(body.track_no)) && Number(body.track_no) >= 1 && Number(body.track_no) <= 99 ? Number(body.track_no) : null,
        musicalKey: str("musical_key", 12),
        isrc: /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(str("isrc", 12).toUpperCase().replace(/-/g, "")) ? str("isrc", 12).toUpperCase().replace(/-/g, "") : "",
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
