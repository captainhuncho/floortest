import "server-only";
import { recentCount } from "./ratelimit";
import { botCheckKey, passedTurnstile } from "./turnstile";

/** After this many recent wrong tries (per account or per connection), sign-in asks for the human check. */
export const HUMAN_CHECK_AFTER = 3;
const WINDOW = 15 * 60_000;

/** Recent failures for this account or connection: whichever is higher. */
export async function recentFailures(emailBucket: string, ipBucket: string, email: string, ip: string) {
  const [e, i] = await Promise.all([recentCount(emailBucket, email, WINDOW), recentCount(ipBucket, ip, WINDOW)]);
  return Math.max(e, i);
}

/**
 * Whether this attempt may go ahead: always, under the threshold or with the bot check off; otherwise only with a
 * passed Cloudflare check. `challenge` tells the form to show the check.
 */
export async function humanCheck(failures: number, form: FormData, ip: string): Promise<{ ok: true } | { ok: false; challenge: boolean }> {
  if (failures < HUMAN_CHECK_AFTER || !(await botCheckKey())) return { ok: true };
  return (await passedTurnstile(form.get("cf-turnstile-response"), ip, "auth")) ? { ok: true } : { ok: false, challenge: true };
}

export const HUMAN_MESSAGE = "Too many wrong tries. Confirm you're human below, then try again.";
