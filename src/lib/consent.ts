/**
 * The visitor's cookie-banner choice (owner's rule, 20 Oct 2026): Vercel Analytics and browser Sentry run only after
 * "accepted"; "rejected" or no choice yet means neither loads. Turnstile on the forms that need it stays on as strictly
 * necessary. The choice lives in a first-party cookie for a year; any link to `#cookie-settings` reopens the banner.
 */
export type Consent = "accepted" | "rejected" | null;

export const CONSENT_COOKIE = "ft_consent";
export const COOKIE_SETTINGS_HASH = "#cookie-settings";
const CONSENT_DAYS = 365;
const CONSENT_EVENT = "ft:consent";

export function parseConsent(value: string | null | undefined): Consent {
  return value === "accepted" || value === "rejected" ? value : null;
}

export function consentFromCookieHeader(header: string): Consent {
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === CONSENT_COOKIE) return parseConsent(rest.join("="));
  }
  return null;
}

// Once analytics or Sentry may have started on this page, a later "Not now" has to reload to stop them.
let acceptedOnThisPage = false;
export const acceptedEarlierOnThisPage = () => acceptedOnThisPage;

export function readConsent(): Consent {
  const consent = typeof document === "undefined" ? null : consentFromCookieHeader(document.cookie);
  if (consent === "accepted") acceptedOnThisPage = true;
  return consent;
}

function announce(consent: Consent) {
  window.dispatchEvent(new CustomEvent<Consent>(CONSENT_EVENT, { detail: consent }));
}

export function writeConsent(consent: "accepted" | "rejected") {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${CONSENT_COOKIE}=${consent}; Max-Age=${CONSENT_DAYS * 86_400}; Path=/; SameSite=Lax${secure}`;
  if (consent === "accepted") acceptedOnThisPage = true;
  announce(consent);
}

/** "Cookie settings": forget the choice so the banner asks again. */
export function clearConsent() {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax`;
  announce(null);
}

export function onConsentChange(listener: (consent: Consent) => void) {
  const handler = (event: Event) => listener((event as CustomEvent<Consent>).detail);
  window.addEventListener(CONSENT_EVENT, handler);
  return () => window.removeEventListener(CONSENT_EVENT, handler);
}
