import { expect, test } from "./fixtures";

/**
 * Owner's "No clickjacking" rule (23 Oct): every kind of response refuses to be framed, by both headers. Covers what
 * route handlers and the proxy answer themselves (redirects, 401s, 404s, JSON, static files), not only pages.
 */
const ROUTES = [
  "/",
  "/login",
  "/dashboard/review", // signed out: redirected to sign-in
  // Not "/dashboard" (a next.config redirect): the dev server sends those without headers(); production adds both
  // (checked live 23 Oct), and a body-less redirect can't be framed anyway.
  "/api/health",
  "/api/v1/me", // 401
  "/api/tracks/1/audio", // 401
  "/no-such-page-anywhere", // 404 page
  "/receipt/notarealtoken000",
  "/c/notarealtoken000",
  "/robots.txt",
];

test("every route type sends X-Frame-Options DENY and CSP frame-ancestors 'none'", async ({ request }) => {
  const home = await (await request.get("/")).text();
  const asset = home.match(/\/_next\/static\/[^"']+\.js/)?.[0];
  expect(asset, "a static script on the home page").toBeTruthy();
  for (const path of [...ROUTES, asset!]) {
    const res = await request.get(path, { maxRedirects: 0 });
    const h = res.headers();
    expect(h["x-frame-options"], path).toBe("DENY");
    expect(h["content-security-policy"] ?? "", path).toMatch(/frame-ancestors 'none'/);
  }
});
