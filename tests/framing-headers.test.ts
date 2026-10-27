import { test } from "node:test";
import assert from "node:assert/strict";

// Owner's "No clickjacking" rule (23 Oct): every response refuses to be framed, by both headers, in production builds.
test("production config sends X-Frame-Options DENY and CSP frame-ancestors 'none' on every path", async () => {
  Object.assign(process.env, { NODE_ENV: "production" });
  const { default: config } = await import("../next.config");
  const rules = await config.headers!();
  const all = rules.find((r) => r.source === "/:path*");
  assert.ok(all, "one header rule covers every path");
  const get = (key: string) => all.headers.filter((h) => h.key.toLowerCase() === key.toLowerCase()).map((h) => h.value);
  assert.deepEqual(get("X-Frame-Options"), ["DENY"]);
  // Pages opened from FloorTest (or that open it) can't reach its window.
  assert.deepEqual(get("Cross-Origin-Opener-Policy"), ["same-origin"]);
  const csp = get("Content-Security-Policy");
  assert.equal(csp.length, 1, "exactly one CSP header");
  assert.match(csp[0], /(^|;\s*)frame-ancestors 'none'(;|$)/);
  // No rule anywhere opens framing up for a single path.
  for (const r of rules)
    for (const h of r.headers) {
      if (h.key.toLowerCase() === "x-frame-options") assert.equal(h.value, "DENY", r.source);
      if (h.key.toLowerCase() === "content-security-policy") assert.match(h.value, /frame-ancestors 'none'/, r.source);
    }
});
