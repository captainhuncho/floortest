import { test } from "node:test";
import assert from "node:assert/strict";

process.env.APP_URL = "https://floortest.app";
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");

test("downloads that record Downloaded only accept requests started on FloorTest", async () => {
  const { fromThisSite } = await import("../src/lib/same-site");
  const h = (o: Record<string, string>) => new Headers(o);
  assert.equal(fromThisSite(h({ "sec-fetch-site": "same-origin" })), true, "a button on our page");
  assert.equal(fromThisSite(h({ "sec-fetch-site": "none" })), true, "typed or bookmarked");
  assert.equal(fromThisSite(h({ "sec-fetch-site": "cross-site" })), false, "a link on another site");
  assert.equal(fromThisSite(h({ "sec-fetch-site": "same-site" })), false, "another subdomain");
  assert.equal(fromThisSite(h({ referer: "https://floortest.app/dashboard/prepare" })), true, "older browser, our page");
  assert.equal(fromThisSite(h({ referer: "https://evil.example/x.html" })), false, "older browser, another site");
  assert.equal(fromThisSite(h({})), true, "no headers at all: allowed, as before");
});
