import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database and a gated site, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-gated-handles-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.SITE_PASSWORD = "gate-test-only";
delete process.env.VERCEL_ENV;
delete process.env.DATABASE_URL;

const SITE = "https://floortest.app";

async function qr(handle: string, cookie?: string) {
  const { GET } = await import("../src/app/api/qr/[handle]/route");
  const headers: Record<string, string> = { "x-real-ip": "7.7.7.7" };
  if (cookie) headers.cookie = cookie;
  return GET(new Request(`${SITE}/api/qr/${handle}`, { headers }), { params: Promise.resolve({ handle }) } as RouteContext<"/api/qr/[handle]">);
}

async function cover(handle: string, cookie?: string) {
  const { GET } = await import("../src/app/api/cover/[handle]/route");
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  return GET(new Request(`${SITE}/api/cover/${handle}`, { headers }), { params: Promise.resolve({ handle }) } as RouteContext<"/api/cover/[handle]">);
}

test("while the site is gated, the QR and cover routes serve a real handle, since receiving links are open", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, created_at, cover_key) VALUES ('real@x.io', 'h', 'Real', 'realdj', 'free', 1, 'covers/realdj.webp')");
  await (await storage()).put("covers/realdj.webp", new Uint8Array([1, 2, 3]), "image/webp");

  assert.equal((await qr("realdj")).status, 200, "no gate pass needed for the QR code");
  assert.equal((await cover("realdj")).status, 200, "no gate pass needed for the cover on the receiving link");
  assert.equal((await qr("nobody-here")).status, 404);
  assert.equal((await cover("nobody-here")).status, 404);
});

test("the gate lets receiving links, receipts and sender history through and keeps the rest behind the password", async () => {
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("../src/proxy");
  const gated = (p: string) => /\/coming-soon/.test(proxy(new NextRequest(`${SITE}${p}`)).headers.get("x-middleware-rewrite") ?? "");

  for (const p of ["/realdj", "/RealDJ", "/realdj/", "/real-dj_2", "/nobody-here", "/sent", "/sent/sometoken", "/sent/reopen/sometoken", "/receipt/sometoken"])
    assert.equal(gated(p), false, `${p} is open`);
  for (const p of ["/", "/pricing", "/signup", "/terms", "/privacy", "/waitlist", "/dashboard", "/dashboard/floor", "/admin", "/realdj/extra", "/a", "/-x", "/x.y", `/${"a".repeat(31)}`, "/Pricing", "/PRICING/", "/a%2Fb", "/%61dmin", "//realdj", "/_next", "/x.png"])
    assert.equal(gated(p), true, `${p} stays behind the password`);
  const { RESERVED_HANDLES } = await import("../src/lib/plans");
  for (const name of RESERVED_HANDLES) {
    if (name.includes(".") || ["auth", "brand", "icons", "motion", "tour", "fonts", "images", "_next", "static", "api", "c", "invite", "join", "sent", "receipt", "coming-soon", "login", "forgot", "reset", "signed-out"].includes(name)) continue;
    assert.equal(gated(`/${name}`), true, `/${name} is a page, so it stays behind the password`);
  }
});
