import { test } from "node:test";
import assert from "node:assert/strict";

// Owner, 1 Nov: no personal data, private link or page about a person may appear on Google. Only the public pages
// may be listed; everything else answers X-Robots-Tag noindex, and robots.txt doesn't hide that header from crawlers.
const PRIVATE_PATHS = [
  "/someone", // a receiver's link page
  "/someone/",
  "/receipt/abc123",
  "/sent/abc123",
  "/sent/reopen/abc123",
  "/c/abc123",
  "/join/abc123",
  "/invite/FLOOR-ABCDEFGHIJ",
  "/reset/abc123",
  "/verify-email/abc123",
  "/confirm-email/abc123",
  "/unsubscribe/abc123",
  "/newsletter/confirm/abc123",
  "/dashboard",
  "/admin",
  "/api/v1/sends",
  "/login",
  "/signup",
  "/pricing/extra",
];

async function robotsHeader(path: string) {
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("../src/proxy");
  return proxy(new NextRequest(`https://floortest.app${path}`)).headers.get("x-robots-tag");
}

test("every private path answers noindex, nofollow, noarchive", async () => {
  for (const path of PRIVATE_PATHS) assert.equal(await robotsHeader(path), "noindex, nofollow, noarchive", path);
});

test("the public pages carry no noindex header", async () => {
  const { PUBLIC_PAGES } = await import("../src/lib/search-index");
  for (const path of PUBLIC_PAGES) assert.equal(await robotsHeader(path), null, path);
});

test("the sitemap lists exactly the public pages", async () => {
  const { PUBLIC_PAGES } = await import("../src/lib/search-index");
  const { default: sitemap } = await import("../src/app/sitemap");
  const paths = sitemap().map((e) => new URL(e.url).pathname);
  assert.deepEqual(paths, PUBLIC_PAGES);
});

test("robots.txt lets crawlers open link pages, so they see the noindex instead of listing the bare link", async () => {
  const { default: robots } = await import("../src/app/robots");
  const rules = [robots().rules].flat();
  const blocked = (path: string) => rules.some((r) => [r.disallow ?? []].flat().some((d) => path.startsWith(d)));
  for (const path of ["/someone", "/receipt/abc123", "/sent/abc123", "/c/abc123", "/join/abc123", "/invite/X", "/reset/abc123", "/verify-email/abc123", "/confirm-email/abc123", "/unsubscribe/abc123"])
    assert.equal(blocked(path), false, path);
  // Signed-in areas, the API and links that act on a plain visit stay closed to crawlers.
  for (const path of ["/dashboard", "/admin", "/api/v1/sends", "/newsletter/confirm/abc123", "/sent/reopen/abc123"]) assert.equal(blocked(path), true, path);
});
