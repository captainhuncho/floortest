import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Owner, 2 Nov: hidden files (.env, .git, .htaccess, any part starting with ".") never leave the server, even if one lands
// in public/ by mistake. Only /.well-known/ (security.txt) is public.
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");

const HIDDEN = [
  "/.env",
  "/.env.local",
  "/.env.production",
  "/.git/config",
  "/.git/HEAD",
  "/.htaccess",
  "/.DS_Store",
  "/.npmrc",
  "/.mcp.json",
  "/.vercel/project.json",
  "/.next/BUILD_ID",
  "/icons/.DS_Store",
  "/images/.secret.png",
  "/brand/.env.txt",
  "/.env.txt",
  "/%2Eenv",
  "/%2egit/config",
  "/api/.env",
  "/.well-known/.hidden",
  "/.well-known/.env.txt",
  "/a/.well-known/security.txt",
  // Encoded dots and separators (Safety review, 2 Nov): each once skipped the proxy or hid the dot from the check.
  "/icons/%2Ex.png",
  "/%2Eenv.txt",
  "/images/%2Eenv.png",
  "/icons/a%2F.x.png",
  "/icons/a%2f.x.png",
  "/a%5C.env.txt",
  "/%252Eenv",
  "/.well-known%2F.env",
];
const PUBLIC = ["/", "/login", "/.well-known/security.txt", "/icons/icon-192.png", "/favicon.ico", "/robots.txt", "/maxwell", "/receipt/abc.def", "/api/health"];

test("isHiddenPath: any part starting with a dot, %2E included; only /.well-known/ itself is public", async () => {
  const { isHiddenPath } = await import("../src/lib/dot-paths");
  for (const p of HIDDEN) assert.equal(isHiddenPath(p), true, p);
  for (const p of PUBLIC) assert.equal(isHiddenPath(p), false, p);
});

test("the proxy answers hidden files with not found before the gate; security.txt stays open behind it", async () => {
  Object.assign(process.env, { NODE_ENV: "production", SITE_PASSWORD: "letmein", OPS_URL: "" });
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("../src/proxy");
  for (const p of HIDDEN) {
    const res = (await proxy(new NextRequest(`https://floortest.app${p}`)));
    assert.equal(res.status, 404, p);
    assert.match(res.headers.get("x-middleware-rewrite") ?? "", /\/_not-found$/, `${p}: the not-found page, never the file`);
  }
  // security.txt stays readable behind the coming-soon gate.
  const sec = (await proxy(new NextRequest("https://floortest.app/.well-known/security.txt")));
  assert.equal(sec.status, 200);
  assert.doesNotMatch(sec.headers.get("x-middleware-rewrite") ?? "", /coming-soon|_not-found/);
});

test("the proxy matcher never skips a hidden path, even one ending in .png or .txt", () => {
  const source = fs.readFileSync(new URL("../src/proxy.ts", import.meta.url), "utf8");
  const matcher = source.match(/matcher: \["(.+)"\]/)?.[1]?.replace(/\\\\/g, "\\");
  assert.ok(matcher);
  const runsProxy = new RegExp(`^${matcher}$`);
  for (const p of HIDDEN) assert.ok(runsProxy.test(p), `${p} goes through the proxy`);
  // Static files still skip it, as before.
  for (const p of ["/icons/icon-192.png", "/robots.txt", "/_next/static/chunks/a.js", "/fonts/x.woff2"]) assert.ok(!runsProxy.test(p), `${p} still skips the proxy`);
});
