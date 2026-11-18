import { runCronRequest } from "@/lib/cron-jobs";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Every 15 minutes (with the held uploads check, so the database can sleep between them): the email queue. The job itself is in src/lib/cron-jobs.ts, shared with Admin → Jobs → Run now. */
export const GET = (req: Request) => runCronRequest(req, "mail");
