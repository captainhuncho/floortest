import "server-only";
import { env, isProd } from "./env";

/**
 * Scheduled endpoints accept "Authorization: Bearer $CRON_SECRET" (what Vercel Cron sends).
 * Without a secret they only run outside production.
 */
export function cronAuthorized(req: Request) {
  if (env.cronSecret) return req.headers.get("authorization") === `Bearer ${env.cronSecret}`;
  return !isProd;
}
