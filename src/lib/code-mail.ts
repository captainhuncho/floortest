/**
 * What the person waiting for a code sees when its email didn't go. Codes last 10 minutes and are sent as expiring
 * email (`expires: true`), so past the day's shared part they're dropped rather than held for midnight.
 */
/** How long an emailed code works; an expiring email older than this is never sent (src/lib/mail.ts). */
export const CODE_EMAIL_TTL_MS = 10 * 60_000;

export function codeMailProblem(status: string): string | null {
  // Held back by the daily limit, or not sent because the block list couldn't be checked: either way nothing went out.
  if (status.startsWith("dropped (daily limit)") || status.startsWith("queued (daily limit)") || status.startsWith("dropped (block check"))
    return "We can't send codes right now. Try again in a few minutes.";
  if (status.startsWith("dropped (expired)")) return "The code took too long to send, so it wasn't. Ask for a new one.";
  if (status.startsWith("skipped")) return "Emails to this address bounced before, so the code can't reach it. Check the address, or use another one.";
  if (status.startsWith("failed")) return "The code email didn't go through. Check the address, then try again in a minute.";
  return null;
}
