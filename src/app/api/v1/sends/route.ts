import { appUser } from "@/lib/app-auth";
import { body, fail, json, unauthorized } from "@/lib/api-v1";
import { userByHandle } from "@/lib/desk";
import { IntakeError, startUpload } from "@/lib/intake";
import { ipFrom } from "@/lib/ratelimit";
import { sentBy } from "@/lib/sent";
import { readSubmission } from "@/lib/submission";

export const runtime = "nodejs";

/** What you've sent and how far each one got. The receiver's keep/pass decision is private and never included. */
export async function GET(req: Request) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  const rows = await sentBy(u);
  return json({
    sends: rows.map((r) => ({
      token: r.token, title: r.title, artist: r.artist, receiver: r.receiver, handle: r.handle, sentAt: r.created_at,
      listenedAt: r.played_at, downloadedAt: r.downloaded_at, repliedAt: r.replied_at, playedOutAt: r.played_out_at, removedAt: r.deleted_at,
    })),
  });
}

/**
 * Step 1 of sending a track from your account: { to, title, artist, genre, mix_status, release_status, ai_use, fileName, size, ... }
 * (the same fields and rules as the website). Returns { uploadId, target }: PUT the file to target.url with target.headers,
 * then call /api/v1/sends/complete. The bytes go straight to storage, never through here.
 */
export async function POST(req: Request) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  const data = await body(req);
  const receiver = await userByHandle(String(data.to ?? "").trim().toLowerCase().slice(0, 30));
  if (!receiver) return fail("No one has that link.", 404);
  const read = await readSubmission(data, receiver, u);
  if ("error" in read) return fail(read.error, read.status);
  try {
    return json(await startUpload(receiver, read.meta, read.size, ipFrom(req.headers)));
  } catch (e) {
    if (e instanceof IntakeError) return fail(e.message, e.status);
    console.error("[v1:send:start]", e);
    return fail("Something went wrong. Please try again.", 500);
  }
}
