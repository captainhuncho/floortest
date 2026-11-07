import "server-only";
import { allow, recentCount, record } from "./ratelimit";
import { botCheckKey, passedTurnstile } from "./turnstile";

const HOUR = 3_600_000;

/** Per form: requests per connection and per address from one connection (both hard stops), each an hour. */
const LIMITS = {
  reset: { ip: 5, pair: 3 },
  login_code: { ip: 10, pair: 5 },
} as const;
/** Requests for one address from everywhere in an hour before every further one needs the human check. */
export const EMAIL_SOFT = 3;
/** With the human check switched off: a hard stop for one address from everywhere, so its inbox can't be flooded. */
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
 * one address from everywhere, every connection (the owner's too) only has to pass the human check. With the check
 * switched off, a higher stop per address keeps its inbox from being flooded.
 * Returns null when the request may go ahead, or the form's answer: the same whether or not the address has an account.
 */
export async function emailRequestBlocked(kind: EmailForm, email: string, ip: string, form: FormData): Promise<{ error: string; challenge?: boolean } | null> {
  const limit = LIMITS[kind];
  const everywhere = await recentCount(`${kind}_email`, email, HOUR);
  if (everywhere >= EMAIL_SOFT) {
    if (await botCheckKey()) {
      if (!(await passedTurnstile(form.get("cf-turnstile-response"), ip, "auth"))) return { error: HUMAN_REQUESTS, challenge: true };
    } else if (everywhere >= EMAIL_HARD) return { error: TOO_MANY[kind] };
  }
  if (!(await allow(`${kind}_ip`, ip, limit.ip, HOUR)) || !(await allow(`${kind}_pair`, `${ip}|${email}`, limit.pair, HOUR))) return { error: TOO_MANY[kind] };
  await record(`${kind}_email`, email);
  return null;
}
