import { runCronRequest } from "@/lib/cron-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Daily at 08:00 UTC: digests, reminders and nudges, queued for the email job. The job itself is in src/lib/cron-jobs.ts, shared with Admin → Jobs → Run now. */
export const GET = (req: Request) => runCronRequest(req, "digest");
