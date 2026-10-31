import { expect, test } from "./fixtures";

/**
 * Owner's "Hide the stack" rule (31 Oct): nothing served to the public names the framework or a version. No
 * X-Powered-By (next.config.ts `poweredByHeader: false`), no version number in Server or any other header, and the
 * public health body carries no version or commit. Vercel's own headers (Server: Vercel, x-vercel-id, x-vercel-cache,
 * x-matched-path) are an accepted limit (SECURITY.md); this server sends no Server header at all.
 */
const ROUTES = [
  "/",
  "/login",
  "/signup",
  "/maxwell", // a [handle] page (seeded receiver)
  "/api/health",
  "/no-such-page-anywhere", // 404 page
];

// A version-like number: 1.2, 16.4.1, v20.11.0 and the like.
const VERSION = /\bv?\d+\.\d+(\.\d+)?\b/;

test("main routes send no X-Powered-By and no version in Server or any header", async ({ request }) => {
  for (const path of ROUTES) {
    const res = await request.get(path, { maxRedirects: 0 });
    const h = res.headers();
    expect(h["x-powered-by"], path).toBeUndefined();
    expect(h["server"] ?? "", path).not.toMatch(VERSION);
    for (const [name, value] of Object.entries(h)) {
      // Dates, cache lifetimes, the CSP and cookies hold digits by design; none of them name the stack.
      if (["date", "content-security-policy", "set-cookie", "strict-transport-security", "cache-control", "expires", "last-modified", "retry-after", "content-length", "etag", "vary", "link"].includes(name)) continue;
      expect(`${name}: ${value}`, path).not.toMatch(/next\.?js|node\.?js|express|\bvercel\/\d/i);
    }
  }
});

test("public health body carries no version, commit or runtime", async ({ request }) => {
  const res = await request.get("/api/health");
  const body = await res.text();
  expect(JSON.parse(body)).toEqual({ ok: true, checks: { database: "ok" } });
  expect(body).not.toMatch(VERSION);
  expect(body).not.toMatch(/version|commit|sha|node/i);
});
