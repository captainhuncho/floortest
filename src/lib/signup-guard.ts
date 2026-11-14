/**
 * Sign-up limits (Safety audit, 13 Nov; the owner set the site-wide cap at 100 an hour). Per connection: 10 an hour and
 * 20 a day. Site-wide: 100 an hour, so a bot spread over many connections can't open thousands of accounts. When the
 * bot check couldn't really check anything (switched off, Cloudflare down, our setup wrong), much tighter: 2 a day per
 * connection and 50 a day in all. Used by sign-up (src/app/(auth)/actions.ts) and shown on Admin → Security.
 */
export const SIGNUP_CAPS = { ipHour: 10, ipDay: 20, allHour: 100, openIpDay: 2, openAllDay: 50 } as const;

/**
 * Well-known throwaway inbox services. Kept short and in the repo on purpose (no package, no download): it stops the
 * lazy bot run, not a determined one; the caps and the confirmation rule do the rest.
 */
const THROWAWAY = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "33mail.com",
  "anonaddy.me",
  "burnermail.io",
  "discard.email",
  "dispostable.com",
  "emailondeck.com",
  "fakeinbox.com",
  "getairmail.com",
  "getnada.com",
  "guerrillamail.biz",
  "guerrillamail.com",
  "guerrillamail.de",
  "guerrillamail.info",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "harakirimail.com",
  "inboxkitten.com",
  "mail.tm",
  "mailcatch.com",
  "maildrop.cc",
  "mailinator.com",
  "mailinator.net",
  "mailnesia.com",
  "mintemail.com",
  "mohmal.com",
  "moakt.com",
  "mytemp.email",
  "nada.email",
  "sharklasers.com",
  "spam4.me",
  "spamgourmet.com",
  "temp-mail.io",
  "temp-mail.org",
  "tempail.com",
  "tempmail.dev",
  "tempmail.net",
  "tempmailo.com",
  "tempr.email",
  "throwawaymail.com",
  "trashmail.com",
  "trashmail.de",
  "trashmail.net",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
]);

/** True for an address at a throwaway inbox service, or any subdomain of one. Takes an address already through normalEmail. */
export function isThrowawayEmail(email: string) {
  const domain = email.split("@").pop() ?? "";
  const parts = domain.split(".");
  for (let i = 0; i < parts.length - 1; i++) if (THROWAWAY.has(parts.slice(i).join("."))) return true;
  return false;
}
