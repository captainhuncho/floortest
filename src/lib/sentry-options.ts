/**
 * Sentry settings shared by browser, server and edge. Crash reports only: no session replay,
 * no performance tracing, and no personal data (IPs, cookies, request bodies are left out).
 * Off when NEXT_PUBLIC_SENTRY_DSN is unset (local development).
 */
export const sentryOptions = {
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.VERCEL_ENV ?? "development",
  sendDefaultPii: false,
  tracesSampleRate: 0,
};
