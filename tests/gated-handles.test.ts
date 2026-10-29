import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database and a gated site, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-gated-handles-"));
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

const shape = async (r: Response) => ({ status: r.status, body: await r.text() });

test("while the site is gated, the QR and cover routes answer for a real handle exactly as for an unknown one", async () => {
  const { q } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { GATE_COOKIE, gateToken } = await import("../src/lib/site-gate");
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, created_at, cover_key) VALUES ('real@x.io', 'h', 'Real', 'realdj', 'free', 1, 'covers/realdj.webp')");
  await (await storage()).put("covers/realdj.webp", new Uint8Array([1, 2, 3]), "image/webp");

  const unknownQr = await shape(await qr("nobody-here"));
  assert.equal(unknownQr.status, 404);
  assert.deepEqual(await shape(await qr("realdj")), unknownQr, "QR: no pass, so a real handle looks unknown");

  const unknownCover = await shape(await cover("nobody-here"));
  assert.equal(unknownCover.status, 404);
  assert.deepEqual(await shape(await cover("realdj")), unknownCover, "cover: no pass, so a real handle looks unknown");

  const forged = `${GATE_COOKIE}=not-the-pass`;
  assert.equal((await qr("realdj", forged)).status, 404, "a wrong pass is no pass");

  const pass = `${GATE_COOKIE}=${gateToken()}`;
  assert.equal((await qr("realdj", pass)).status, 200, "with the gate pass the QR code is served");
  assert.notEqual((await cover("realdj", pass)).status, 404, "with the gate pass the cover is served");
  assert.equal((await qr("nobody-here", pass)).status, 404);
});
