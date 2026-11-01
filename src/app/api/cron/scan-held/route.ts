import { runCronRequest } from "@/lib/cron-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Every 5 minutes: the held uploads virus check. The job itself is in src/lib/cron-jobs.ts, shared with Admin → Jobs → Run now. */
export const GET = (req: Request) => runCronRequest(req, "scan");
