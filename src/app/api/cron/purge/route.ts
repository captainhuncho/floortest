import { runCronRequest } from "@/lib/cron-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Daily at 03:30 UTC: old records cleaned, the database backed up, then warnings and retention deletions. The job itself is in src/lib/cron-jobs.ts, shared with Admin → Jobs → Run now. */
export const GET = (req: Request) => runCronRequest(req, "purge");
