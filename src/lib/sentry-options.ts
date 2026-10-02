/**
 * Sentry settings shared by browser, server and edge. Crash reports plus performance tracing
 * (how long pages, API routes and database calls take). No session replay and no personal data
 * (IPs, cookies, request bodies are left out).
 * Off when NEXT_PUBLIC_SENTRY_DSN is unset (local development).
 */
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "development",
  sendDefaultPii: false,
  // Trace every request on staging; a fifth of live traffic, to stay well inside Sentry's free quota.
  tracesSampleRate: (process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV) === "production" ? 0.2 : 1,
};
