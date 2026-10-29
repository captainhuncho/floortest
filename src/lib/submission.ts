import "server-only";
import { senderProfiles } from "@/lib/socials";
import type { User } from "@/lib/db";
import type { SubmissionMeta } from "@/lib/intake";
import { folderLimit } from "@/lib/plan-store";
import { cleanGenre, MIX_STATUS, AI_USE, RELEASE_STATUS, MAX_BATCH_TRACKS, MAX_RELEASE_TRACKS } from "@/lib/plans";
import { normalEmail } from "./email-normal";

type Problem = { error: string; status: number };

/**
 * Reads and checks a send (step 1 of a submission) the same way for the website and the app.
 * `account` is the signed-in sender, or null for someone sending from the public link (name and email from the form).
 * Returns the upload's details, or the message to show.
 */
export async function readSubmission(
  body: Record<string, unknown>,
  receiver: User,
  account: User | null,
): Promise<Problem | { meta: SubmissionMeta; size: number }> {
  const bad = (error: string, status = 400): Problem => ({ error, status });
  const str = (k: string, max: number) => String(body[k] ?? "").trim().slice(0, max);
  const pick = (k: string, allowed: object) => (Object.hasOwn(allowed, str(k, 20)) ? str(k, 20) : "");
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
  // Sending as an account files the track under that email's sender history, so the account must have proved the email.
  if (account && !account.email_verified_at) return bad("Confirm your email before sending from your account. Check your inbox for the link.", 403);
  const name = account ? account.name : str("name", 100);
  const email = account ? account.email.toLowerCase() : normalEmail(str("email", 200));
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
  const isrc = str("isrc", 12).toUpperCase().replace(/-/g, "");

  return {
    size,
    meta: {
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
      // How many tracks this send holds, so they go out in one receipt email (src/lib/send-receipts.ts).
      ...((release || batch) && Number.isInteger(body.send_size) && Number(body.send_size) >= 2
        ? { sendSize: Math.min(Number(body.send_size), release ? MAX_RELEASE_TRACKS : MAX_BATCH_TRACKS) }
        : {}),
      trackNo: Number.isInteger(Number(body.track_no)) && Number(body.track_no) >= 1 && Number(body.track_no) <= 99 ? Number(body.track_no) : null,
      musicalKey: str("musical_key", 12),
      isrc: /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc) ? isrc : "",
      ...(account ? { accountId: account.id, emailConfirmed: !!account.email_verified_at } : { emailConfirmed: true }),
    },
  };
}

/** The optional in-browser analysis sent with step 2 (complete): kept only when it's sane. */
export function readAnalysis(body: Record<string, unknown>) {
  const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) && v > lo && v < hi ? v : null);
  const peaks =
    Array.isArray(body.peaks) && body.peaks.length <= 400 && body.peaks.every((v) => typeof v === "number" && Number.isFinite(v))
      ? (body.peaks as number[]).map((v) => Math.min(1, Math.max(0, v)))
      : null;
  return { duration: num(body.duration, 0, 60 * 60 * 3), bpm: num(body.bpm, 40, 250), peaks };
}
