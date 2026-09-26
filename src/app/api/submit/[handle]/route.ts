import path from "node:path";
import { NextResponse } from "next/server";
import { activeCollection, capacity, IntakeError, isClosed, isPaused, pausedMessage, submitTrack, userByHandle } from "@/lib/core";
import { ACCEPTED_EXT, cleanGenre, MAX_UPLOAD_BYTES, MIX_STATUS, RELEASE_STATUS } from "@/lib/plans";
import { validateAudio } from "@/lib/validate";

export const runtime = "nodejs";

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function POST(req: Request, ctx: RouteContext<"/api/submit/[handle]">) {
  const { handle } = await ctx.params;
  const receiver = userByHandle(handle);
  if (!receiver) return bad("Receiver not found", 404);

  // Refuse before reading the body when the link isn't taking tracks.
  if (isPaused(receiver)) return bad(pausedMessage(receiver), 409);
  if (isClosed(activeCollection(receiver))) return bad(`This callout closed. ${receiver.name} isn't accepting tracks right now.`, 409);
  if (capacity(receiver).full) return bad(`${receiver.name} isn't accepting new tracks right now.`, 409);
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_UPLOAD_BYTES + 1024 * 1024) return bad("File is too large (max 250 MB).", 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return bad("Could not read the upload.");
  }
  const str = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const name = str("name", 100);
  const email = str("email", 200).toLowerCase();
  const title = str("title", 200);
  const artist = str("artist", 200) || name;
  const message = str("message", 2000);
  const pick = (k: string, allowed: object) => (Object.hasOwn(allowed, str(k, 20)) ? str(k, 20) : "");
  const releaseStatus = pick("release_status", RELEASE_STATUS);
  const mixStatus = pick("mix_status", MIX_STATUS);
  // Any genre is accepted ("Other…" lets senders type their own); it's only cleaned and length-limited.
  const genre = cleanGenre(String(form.get("genre") ?? ""));
  const file = form.get("file");

  if (!(file instanceof File) || file.size === 0) return bad("Choose a WAV or MP3 file.");
  if (!ACCEPTED_EXT.includes(path.extname(file.name).toLowerCase())) return bad("Only WAV and MP3 files are accepted.");
  if (file.size > MAX_UPLOAD_BYTES) return bad("File is too large (max 250 MB).", 413);
  if (!title) return bad("Add a track title.");
  if (!genre) return bad("Choose a genre.");
  if (!name) return bad("Add your name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("Enter a valid email so we can tell you what happens next.");
  const check = await validateAudio(file);
  if (!check.ok) return bad(check.reason, 415);

  const num = (k: string, lo: number, hi: number) => {
    const n = Number(form.get(k));
    return Number.isFinite(n) && n > lo && n < hi ? n : null;
  };
  let peaks: number[] | null = null;
  try {
    const p = JSON.parse(String(form.get("peaks") || "null"));
    if (Array.isArray(p) && p.length <= 400 && p.every((v) => typeof v === "number")) peaks = p.map((v) => Math.min(1, Math.max(0, v)));
  } catch {}

  const ip = (req.headers.get("x-forwarded-for")?.split(",")[0] || req.headers.get("x-real-ip") || "local").trim();

  try {
    const track = await submitTrack({
      receiver,
      ip,
      name,
      email,
      title,
      artist,
      message,
      releaseStatus,
      mixStatus,
      genre,
      file,
      duration: num("duration", 0, 60 * 60 * 3),
      bpm: num("bpm", 40, 250),
      peaks,
    });
    return NextResponse.json({ token: track.token });
  } catch (e) {
    if (e instanceof IntakeError) return bad(e.message, e.status);
    console.error(e);
    return bad("Upload failed. Please try again.", 500);
  }
}
