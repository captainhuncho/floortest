import * as Sentry from "@sentry/nextjs";

import { redactUrl } from "./lib/redact-url";

export async function register() {
  const { sentryOptions } = await import("./lib/sentry-options");
  Sentry.init(sentryOptions);
}

/** Every unhandled server error goes to Sentry (stack traces, grouping) and the admin incident feed. */
export async function onRequestError(err: unknown, request: Parameters<typeof Sentry.captureRequestError>[1], context: Parameters<typeof Sentry.captureRequestError>[2]) {
  const e = err as Error & { digest?: string };
  // A visitor navigating away mid-load isn't a problem worth reporting.
  if (/stream closed early|aborted|ECONNRESET|socket hang up/i.test(e?.message ?? "")) return;
  Sentry.captureRequestError(err, request, context);
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { recordIncident } = await import("./lib/incidents");
  await recordIncident("server_error", e?.message || "Server error", `${e?.digest ? `digest ${e.digest}\n` : ""}${e?.stack ?? ""}`, `${request.method} ${redactUrl(request.path)}`);
}
