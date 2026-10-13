import { redactUrl } from "./redact-url";

/* eslint-disable @typescript-eslint/no-explicit-any -- Sentry's event shapes differ between browser and server SDKs. */
const scrubEvent = <E,>(event: E): E => {
  const e = event as any;
  if (e.request?.url) e.request.url = redactUrl(e.request.url);
  if (e.request) delete e.request.query_string;
  if (typeof e.transaction === "string") e.transaction = redactUrl(e.transaction);
  for (const b of e.breadcrumbs ?? []) {
    if (typeof b.message === "string") b.message = redactUrl(b.message);
    for (const k of ["url", "to", "from"]) if (typeof b.data?.[k] === "string") b.data[k] = redactUrl(b.data[k]);
  }
  for (const sp of e.spans ?? []) scrubSpan(sp);
  return event;
};
const scrubSpan = <S,>(span: S): S => {
  const sp = span as any;
  if (typeof sp.description === "string") sp.description = redactUrl(sp.description);
  for (const k of ["url", "http.url", "url.full", "url.path", "http.target", "http.route"]) if (typeof sp.data?.[k] === "string") sp.data[k] = redactUrl(sp.data[k]);
  return span;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Sentry settings shared by browser, server and edge. Crash reports plus performance tracing
 * (how long pages, API routes and database calls take). No session replay and no personal data
 * (IPs, cookies, request bodies are left out). Private links (receipts, resets, invites) reach Sentry with their key
 * replaced by [token].
 * Off when NEXT_PUBLIC_SENTRY_DSN is unset (local development).
 */
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "development",
  sendDefaultPii: false,
  // Trace every request on staging; a fifth of live traffic, to stay well inside Sentry's free quota.
  beforeSend: scrubEvent,
  beforeSendTransaction: scrubEvent,
  beforeSendSpan: scrubSpan,
  tracesSampleRate: (process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV) === "production" ? 0.2 : 1,
};
