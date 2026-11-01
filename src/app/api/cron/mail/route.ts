import { runCronRequest } from "@/lib/cron-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Every 10 minutes: the email queue. The job itself is in src/lib/cron-jobs.ts, shared with Admin → Jobs → Run now. */
export const GET = (req: Request) => runCronRequest(req, "mail");
