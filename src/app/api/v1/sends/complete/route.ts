import { appUser } from "@/lib/app-auth";
import { body, fail, json, unauthorized } from "@/lib/api-v1";
import { userByHandle } from "@/lib/desk";
import { recordIncident } from "@/lib/incidents";
import { completeUpload, IntakeError } from "@/lib/intake";
import { readAnalysis } from "@/lib/submission";

/** Room for the virus check of a large file (src/lib/scan.ts) on top of the usual checks. */
export const maxDuration = 60;

export const runtime = "nodejs";

/** Step 2: the file is in storage. { to, uploadId, duration?, bpm?, peaks? }. Checks the file and puts the track on the desk. */
export async function POST(req: Request) {
  const u = await appUser(req);
  if (!u) return unauthorized();
  const data = await body(req);
  const receiver = await userByHandle(String(data.to ?? "").trim().toLowerCase().slice(0, 30));
  if (!receiver) return fail("No one has that link.", 404);
  try {
    const track = await completeUpload(receiver, String(data.uploadId ?? ""), readAnalysis(data));
    return json({ token: track.token });
  } catch (e) {
    if (e instanceof IntakeError) {
      await recordIncident("upload_rejected", `App upload to @${receiver.handle} refused (${e.status})`, e.message, "/api/v1/sends/complete");
      return fail(e.message, e.status);
    }
    console.error("[v1:send:complete]", e);
    await recordIncident("upload_failed", `App upload to @${receiver.handle} failed`, e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "/api/v1/sends/complete");
    return fail("Upload failed. Please try again.", 500);
  }
}
