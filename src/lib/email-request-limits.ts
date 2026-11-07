import "server-only";
import { now, q } from "./db";
import { allow, recentCount } from "./ratelimit";
import { turnstileVerdict } from "./turnstile";

const HOUR = 3_600_000;

/** Per form: requests per connection and per address from one connection (both hard stops), each an hour. */
const LIMITS = {
  reset: { ip: 5, pair: 3 },
  login_code: { ip: 10, pair: 5 },
} as const;
/** Requests for one address from everywhere in an hour before every further one needs the human check. */
export const EMAIL_SOFT = 3;
/**
 * A hard stop for one address from everywhere, used whenever the human check didn't really run (switched off, or
 * Cloudflare couldn't answer, or our setup is wrong), so its inbox can't be flooded.
 */
export const EMAIL_HARD = 10;

export type EmailForm = keyof typeof LIMITS;

const TOO_MANY: Record<EmailForm, string> = {
  reset: "Too many requests. Try again in an hour.",
  login_code: "Too many codes requested. Try again in an hour, or log in with your password.",
};
export const HUMAN_REQUESTS = "Lots of requests for this email. Confirm you're human below, then try again.";

/**
 * Limits on the public forms that email a link or code to an address (forgot password, sign in with a code). Sign-in
 * audit M4 (6 Nov): a stop per address from everywhere let a stranger lock someone out for an hour by asking for codes
 * with their email. So the hard stops are per connection and per address from that connection; past a few requests for
 * one address from everywhere, every connection (the owner's too) only has to pass the human check. When the check
 * didn't really run, a higher stop per address keeps its inbox from being flooded.
 *
 * Race-safe (Safety, 7 Nov): this request's place for the address is taken first, then counted, and handed back if the
 * request is refused, like `allow`. Requests sent at the same moment from many connections each see the others, so they
 * can't all slip under the human check or the hard stop together.
 * Returns null when the request may go ahead, or the form's answer: the same whether or not the address has an account.
 */
export async function emailRequestBlocked(kind: EmailForm, email: string, ip: string, form: FormData): Promise<{ error: string; challenge?: boolean } | null> {
  const limit = LIMITS[kind];
  const mine = await q.get<{ id: number }>("INSERT INTO rate_events (bucket, key, created_at) VALUES (?,?,?) RETURNING id", `${kind}_email`, email, now());
  const refuse = async (answer: { error: string; challenge?: boolean }) => {
    if (mine) await q.run("DELETE FROM rate_events WHERE id = ?", mine.id);
    return answer;
  };
  // Earlier requests for this address in the hour, this one not included.
  const before = (await recentCount(`${kind}_email`, email, HOUR)) - 1;
  if (before >= EMAIL_SOFT) {
    const verdict = await turnstileVerdict(form.get("cf-turnstile-response"), ip, "auth");
    if (verdict === "fail") return refuse({ error: HUMAN_REQUESTS, challenge: true });
    if (verdict === "open" && before >= EMAIL_HARD) return refuse({ error: TOO_MANY[kind] });
  }
  if (!(await allow(`${kind}_ip`, ip, limit.ip, HOUR)) || !(await allow(`${kind}_pair`, `${ip}|${email}`, limit.pair, HOUR))) return refuse({ error: TOO_MANY[kind] });
  return null;
}
