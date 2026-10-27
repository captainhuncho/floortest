import { test } from "node:test";
import assert from "node:assert/strict";

// Owner's "No clickjacking" rule (23 Oct): every response refuses to be framed, by both headers, in production builds.
// Pages and the API get their CSP from the proxy (tests/csp.test.ts checks it keeps frame-ancestors 'none'); the static
// files the proxy skips get it from next.config.ts, checked here.
test("production config sends X-Frame-Options DENY on every path and CSP frame-ancestors 'none' on the files the proxy skips", async () => {
  Object.assign(process.env, { NODE_ENV: "production" });
  const { default: config } = await import("../next.config");
  const { PROXY_SKIPS } = await import("../src/lib/csp");
  const rules = await config.headers!();
  const get = (r: (typeof rules)[number] | undefined, key: string) => (r?.headers ?? []).filter((h) => h.key.toLowerCase() === key.toLowerCase()).map((h) => h.value);
  const all = rules.find((r) => r.source === "/:path*");
  assert.ok(all, "one header rule covers every path");
  assert.deepEqual(get(all, "X-Frame-Options"), ["DENY"]);
  assert.deepEqual(get(all, "Content-Security-Policy"), [], "no second CSP on pages: the proxy sends theirs");
  const skipped = rules.find((r) => r.source === `/:path(${PROXY_SKIPS}.*)`);
  const csp = get(skipped, "Content-Security-Policy");
  assert.equal(csp.length, 1, "exactly one CSP for static files");
  // Pages opened from FloorTest (or that open it) can't reach its window.
  assert.deepEqual(get(all, "Cross-Origin-Opener-Policy"), ["same-origin"]);
  assert.match(csp[0], /(^|;\s*)frame-ancestors 'none'(;|$)/);
  assert.doesNotMatch(csp[0], /script-src[^;]*'unsafe-inline'/, "no inline scripts on static files either");
  // No rule anywhere opens framing up for a single path.
  for (const r of rules)
    for (const h of r.headers) {
      if (h.key.toLowerCase() === "x-frame-options") assert.equal(h.value, "DENY", r.source);
      if (h.key.toLowerCase() === "content-security-policy") assert.match(h.value, /frame-ancestors 'none'/, r.source);
    }
});
