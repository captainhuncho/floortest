import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Rule 4 (audit 27 Oct): scripts run only with the request's nonce. No 'unsafe-inline' for scripts in production.
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
const scriptSrc = (csp: string) => csp.split(/;\s*/).find((d) => d.startsWith("script-src "))!;

test("production pages: script-src has a fresh nonce and 'strict-dynamic', never 'unsafe-inline' or eval", async () => {
  Object.assign(process.env, { NODE_ENV: "production", SITE_PASSWORD: "", OPS_URL: "" });
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("../src/proxy");
  const nonces = new Set<string>();
  for (const path of ["/", "/login", "/privacy", "/dashboard/review", "/api/health"]) {
    const res = proxy(new NextRequest(`https://floortest.app${path}`));
    const csp = res.headers.get("content-security-policy") ?? "";
    const script = scriptSrc(csp);
    const nonce = script.match(/'nonce-([A-Za-z0-9+/=]{22,})'/)?.[1];
    assert.ok(nonce, `${path}: a nonce`);
    nonces.add(nonce);
    assert.match(script, /'strict-dynamic'/, path);
    assert.doesNotMatch(script, /'unsafe-inline'|'unsafe-eval'/, path);
    assert.match(csp, /(^|;\s*)frame-ancestors 'none'(;|$)/, `${path}: still refuses framing`);
    // Next reads the nonce from the request's CSP header when it renders, and puts it on its own scripts.
    assert.equal(res.headers.get("x-middleware-request-content-security-policy"), csp, `${path}: the page renders with the same policy`);
  }
  assert.equal(nonces.size, 5, "a new nonce for every request");
});

test("the policy keeps every other directive as it was before the nonce", async () => {
  const { contentSecurityPolicy } = await import("../src/lib/csp");
  const csp = contentSecurityPolicy({ nonce: "abc", endpoint: "https://acct.r2.cloudflarestorage.com" });
  assert.equal(
    csp.replace(/'nonce-abc' 'strict-dynamic' /, ""),
    [
      "default-src 'self'",
      "script-src 'self' https://challenges.cloudflare.com",
      "frame-src https://challenges.cloudflare.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://*.acct.r2.cloudflarestorage.com https://acct.r2.cloudflarestorage.com",
      "media-src 'self' blob: https://*.acct.r2.cloudflarestorage.com https://acct.r2.cloudflarestorage.com",
      "connect-src 'self' https://*.acct.r2.cloudflarestorage.com https://acct.r2.cloudflarestorage.com https://challenges.cloudflare.com",
      "font-src 'self' data:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  );
  assert.match(scriptSrc(contentSecurityPolicy({ nonce: "abc", dev: true })), /'unsafe-eval'$/, "development only: React's overlays");
});

test("every path gets exactly one CSP: the proxy's (with a nonce) or next.config's (static files)", async () => {
  const { PROXY_SKIPS } = await import("../src/lib/csp");
  const source = fs.readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  const matcher = source.match(/matcher: \["(.+)"\]/)?.[1]?.replace(/\\\\/g, "\\");
  assert.equal(matcher, `/((?!${PROXY_SKIPS.slice(3, -1)}).*)`, "the proxy matcher and PROXY_SKIPS list the same paths");
  const byProxy = new RegExp(`^${matcher}$`);
  const byConfig = new RegExp(`^/(${PROXY_SKIPS}.*)$`);
  for (const path of ["/", "/login", "/maxwell", "/api/health", "/api/v1/me", "/_next/static/chunks/a.js", "/robots.txt", "/icon.svg", "/fonts/x.woff2", "/api/storage/upload", "/favicon.ico", "/images/a.png", "/c/abc", "/dashboard/review"])
    assert.notEqual(byProxy.test(path), byConfig.test(path), path);
});
