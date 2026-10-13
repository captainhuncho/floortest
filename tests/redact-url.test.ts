import { test } from "node:test";
import assert from "node:assert/strict";
import { redactUrl } from "../src/lib/redact-url";
import { sentryOptions } from "../src/lib/sentry-options";

test("private links reach monitoring without their key", () => {
  assert.equal(redactUrl("https://floortest.app/receipt/AbC_12-x"), "https://floortest.app/receipt/[token]");
  assert.equal(redactUrl("/reset/tok123?x=1"), "/reset/[token]?x=1");
  assert.equal(redactUrl("/newsletter/unsubscribe/n-tok"), "/newsletter/unsubscribe/[token]");
  assert.equal(redactUrl("/api/offline/file/f.tok/next"), "/api/offline/file/[token]/next");
  assert.equal(redactUrl("GET /api/c/inv-tok/tracks"), "GET /api/c/[token]/tracks");
  assert.equal(redactUrl("/receipt/[token]"), "/receipt/[token]", "already a route pattern");
  assert.equal(redactUrl("https://x.r2.cloudflarestorage.com/a.wav?X-Amz-Signature=abc&X-Amz-Expires=3600"), "https://x.r2.cloudflarestorage.com/a.wav?[signed]");
  assert.equal(redactUrl("/dashboard/review/12?tab=notes"), "/dashboard/review/12?tab=notes", "ordinary pages are left alone");
  assert.equal(redactUrl("/collections/c-mix"), "/collections/c-mix");
});

test("Sentry events, transactions and spans are scrubbed before sending", () => {
  const event = {
    request: { url: "https://floortest.app/join/inv-secret", query_string: "a=1" },
    transaction: "/sent/send-secret",
    breadcrumbs: [{ message: "GET /api/stems/stem-secret", data: { url: "/c/coll-secret", to: "/verify-email/v-secret" } }],
    spans: [{ description: "GET /api/pulse/receipt/p-secret", data: { "http.url": "/unsubscribe/u-secret" } }],
  };
  const out = JSON.stringify((sentryOptions.beforeSend as (e: unknown) => unknown)(event));
  assert.ok(!/secret/.test(out), out);
  const span = (sentryOptions.beforeSendSpan as (s: unknown) => { description: string })({ description: "GET /confirm-email/c-secret", data: {} });
  assert.equal(span.description, "GET /confirm-email/[token]");
});
