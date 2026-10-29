/**
 * What the person waiting for a code sees when its email didn't go. Codes last 10 minutes and are sent as expiring
 * email (`expires: true`), so past the day's shared part they're dropped rather than held for midnight.
 */
export function codeMailProblem(status: string): string | null {
  if (status.startsWith("dropped (daily limit)") || status.startsWith("queued (daily limit)"))
    return "We can't send codes right now. Please try again in a few minutes.";
  if (status.startsWith("skipped")) return "Emails to this address bounced before, so the code can't reach it. Check the address, or use another one.";
  if (status.startsWith("failed")) return "The code email didn't go through. Check the address, then try again in a minute.";
  return null;
}
