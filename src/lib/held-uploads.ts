import "server-only";
import { discardFiles } from "@/lib/deletion";
import { now, q, USER_COLUMNS, type User } from "./db";
import { BEING_SAVED, completeUpload, HELD_TTL, IntakeError, trackForUpload, UploadHeld, type Analysis, type SubmissionMeta } from "./intake";
import { recordIncident } from "./incidents";
import { APP_URL, sendMailLater } from "./mail";
import { SCAN_REFUSED, wakeScanner } from "./scan";

/**
 * Hold and scan (plan B10 option 3, owner 26 Oct). The virus scanner sleeps when idle; an upload finished while it's
 * asleep (or down) is held instead of refused, and this job, every 10 minutes (`/api/cron/scan-held`), wakes the
 * scanner once for the whole batch and finishes each held upload exactly as the sender's own request would have.
 *
 *   clean             the track is made and the sender's "Delivered" email goes out (their receipt)
 *   flagged           the file is discarded; the sender is emailed that it couldn't be accepted
 *   refused           anything else that stops it (the desk closed or filled up meanwhile): discarded, sender emailed why
 *   still no scanner  stays held; the rest of the batch waits for the next run instead of each waiting 150 s
 *   held a day        (HELD_TTL) the sender is told it wasn't sent, and the file is deleted
 *
 * Nothing unscanned ever becomes a track: completeUpload runs the full check again, scan included.
 */
export const HELD_BATCH = 20;
/**
 * The cron function is stopped at 300 s (maxDuration), and a stopped run records nothing. The batch plans for 260 s,
 * starts no file with under 60 s left, and gives each scan only the time left minus 20 s to seal and save the track.
 */
export const HELD_BUDGET_MS = 260_000;
const HELD_MIN_LEFT_MS = 60_000;
const HELD_FINISH_MS = 20_000;

type Held = { id: string; receiver_id: number; file_key: string; meta: string; held_analysis: string | null; held_at: number };

const mailSender = (receiver: Pick<User, "id">, meta: Partial<SubmissionMeta>, subject: string, body: string) =>
  meta.email ? sendMailLater({ userId: receiver.id, to: meta.email, subject, body }) : Promise.resolve();

async function drop(up: Held, reason: string) {
  await discardFiles([up.file_key], reason, { linkLive: true });
  await q.run("DELETE FROM uploads WHERE id = ?", up.id);
}

export async function scanHeldUploads(at = now(), { until = Date.now() + HELD_BUDGET_MS } = {}) {
  const out = { delivered: 0, refused: 0, gaveUp: 0, waiting: 0 };

  // Held for a day: the scanner never came back. Tell the sender and let the file go.
  const expired = await q.all<Held>("SELECT id, receiver_id, file_key, meta, held_analysis, held_at FROM uploads WHERE held_at < ? LIMIT ?", at - HELD_TTL, HELD_BATCH);
  for (const up of expired) {
    const meta = JSON.parse(up.meta) as Partial<SubmissionMeta>;
    const receiver = await q.get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, up.receiver_id);
    await drop(up, "held upload never scanned");
    if (receiver)
      await mailSender(
        receiver,
        meta,
        `Your track wasn't sent: ${meta.title ?? "your track"}`,
        `We couldn't run the virus check on "${meta.title ?? "your track"}" for ${receiver.name}, so it wasn't sent and the file has been deleted. Please send it again: ${APP_URL}/${receiver.handle}`,
      );
    await recordIncident("upload_failed", "A held upload was never scanned; its sender was told to send again", `receiver #${up.receiver_id}`, "held uploads");
    out.gaveUp++;
  }

  const due = await q.all<Held>(
    "SELECT id, receiver_id, file_key, meta, held_analysis, held_at FROM uploads WHERE held_at IS NOT NULL AND (claimed_at IS NULL OR claimed_at < ?) ORDER BY held_at LIMIT ?",
    at - 10 * 60_000,
    HELD_BATCH,
  );
  if (!due.length) return out;
  // Not enough of the run left to finish a file: wait for the next run rather than be cut off half-way.
  const left = () => until - Date.now();
  if (left() < HELD_MIN_LEFT_MS) {
    out.waiting = due.length;
    return out;
  }
  // One wake-up for the whole batch; each check below still waits for it to be ready.
  await wakeScanner();
  for (const [i, up] of due.entries()) {
    if (left() < HELD_MIN_LEFT_MS) {
      out.waiting = due.length - i;
      break;
    }
    const meta = JSON.parse(up.meta) as Partial<SubmissionMeta>;
    const receiver = await q.get<User>(`SELECT ${USER_COLUMNS} FROM users WHERE id = ?`, up.receiver_id);
    if (!receiver) {
      await drop(up, "held upload for a removed account");
      out.refused++;
      continue;
    }
    const analysis = JSON.parse(up.held_analysis ?? "null") as Analysis | null;
    try {
      // A scan that runs into the end of the run counts as "no scanner": the file stays held, it isn't refused.
      await completeUpload(receiver, up.id, analysis ?? { duration: null, bpm: null, peaks: null }, { from: "batch", scanDeadlineMs: left() - HELD_FINISH_MS });
      out.delivered++;
    } catch (e) {
      if (e instanceof UploadHeld) {
        // Still no scanner after waiting for it: the rest stay held for the next run.
        out.waiting = due.length - i;
        break;
      }
      // The sender's own retry got there first: leave it to that request.
      if (e instanceof IntakeError && e.message === BEING_SAVED) continue;
      if (e instanceof IntakeError) {
        // completeUpload has already discarded a flagged file; anything else it refused is discarded here.
        if (e.status !== 422) await drop(up, "held upload refused");
        const title = meta.title ?? "your track";
        await mailSender(receiver, meta, `Your track wasn't sent: ${title}`, e.status === 422 ? `"${title}" for ${receiver.name}: ${SCAN_REFUSED}` : `"${title}" for ${receiver.name} wasn't sent: ${e.message}`);
        out.refused++;
        continue;
      }
      // A failure after the track was saved (its upload row is gone with it) still delivered the track.
      if (await trackForUpload(receiver.id, up.id)) {
        console.error("[held-uploads] after-save step failed", e);
        out.delivered++;
        continue;
      }
      // No track and no upload left: the file is lost. Never counted as delivered; the sender is told to send again.
      if (!(await q.get("SELECT 1 FROM uploads WHERE id = ?", up.id))) {
        const title = meta.title ?? "your track";
        await mailSender(receiver, meta, `Your track wasn't sent: ${title}`, `"${title}" for ${receiver.name} wasn't sent. Please send it again: ${APP_URL}/${receiver.handle}`);
        await recordIncident("upload_failed", "A held upload was lost before its track was made; its sender was told to send again", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "held uploads");
        out.refused++;
        continue;
      }
      // Anything unexpected: logged, and the upload stays held (its claim runs out and the next run tries again).
      await recordIncident("upload_failed", "A held upload couldn't be finished", e instanceof Error ? `${e.message}\n${e.stack ?? ""}` : String(e), "held uploads");
    }
  }
  return out;
}

/** How many uploads are waiting for their virus check, and since when: for ops and the health report. */
export async function heldUploads() {
  const row = await q.get<{ n: number; oldest: number | null }>("SELECT COUNT(*)::int AS n, MIN(held_at) AS oldest FROM uploads WHERE held_at IS NOT NULL");
  return { count: Number(row?.n ?? 0), oldest: row?.oldest == null ? null : Number(row.oldest) };
}
