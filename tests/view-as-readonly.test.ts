import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");

// Safety audit M1 (6 Nov): an admin's "view as" must be read-only for every way in. A server action can arrive as a plain
// form post without Next's Next-Action header, and on a path the proxy skips no proxy header is set at all. So the
// proxy refuses change requests that carry the view cookie, and auth.ts counts every request as a change unless it
// carries a read mark only the proxy can make (src/lib/read-marker.ts).
const COOKIE = "floortest_view_as=signed.value";

test("a change request during view-as is refused by the proxy, whatever its method", async () => {
  const { NextRequest } = await import("next/server");
  const { proxy, VIEW_AS_COOKIE_NAME } = await import("../src/proxy");
  const set = fs.readFileSync("src/lib/auth.ts", "utf8").match(/export const VIEW_AS_COOKIE = "([^"]+)"/)?.[1];
  assert.equal(VIEW_AS_COOKIE_NAME, set, "the proxy names the same cookie auth.ts sets");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const res = proxy(new NextRequest("https://floortest.app/dashboard/collections/1.png", { method, body: method === "DELETE" ? null : new FormData(), headers: { cookie: COOKIE } }));
    assert.equal(res.status, 303, `${method} refused`);
    assert.match(res.headers.get("location") ?? "", /\/dashboard\/floor\?readonly=1$/);
  }
  for (const path of ["/dashboard/settings", "/dashboard/exit-view"]) assert.notEqual(proxy(new NextRequest(`https://floortest.app${path}`, { headers: { cookie: COOKIE } })).status, 303, `GET ${path} goes through`);
  assert.notEqual(proxy(new NextRequest("https://floortest.app/dashboard/settings", { method: "POST", body: new FormData() })).status, 303, "no view cookie: no refusal");
});

test("the real matcher sends every page and action path through the proxy, whatever it ends in", async () => {
  const { config } = await import("../src/proxy");
  const runsProxy = new RegExp(`^${config.matcher[0]}$`);
  for (const path of ["/dashboard/collections/1.png", "/dashboard/contacts/x.txt", "/c/x.txt", "/x.png", "/somehandle.xml", "/api/submit/x.png", "/dashboard/settings"])
    assert.ok(runsProxy.test(path), `${path} goes through the proxy`);
  for (const path of ["/icons/a.svg", "/brand/deck.png", "/_next/static/x.js", "/robots.txt", "/sitemap.xml", "/favicon.ico", "/api/storage/upload"])
    assert.ok(!runsProxy.test(path), `${path} is still skipped`);
});

test("only the proxy's read mark makes a request a read: skipped, forged or missing marks count as changes", async () => {
  const { isWriteRequest, readMarker, READ_HEADER } = await import("../src/lib/read-marker");
  const h = (pairs: Record<string, string>) => new Headers(pairs);
  assert.equal(isWriteRequest(h({ [READ_HEADER]: readMarker() })), false, "a GET the proxy marked is a read");
  assert.equal(isWriteRequest(h({})), true, "a skipped path carries no mark: a change");
  assert.equal(isWriteRequest(h({ "x-ft-write": "0" })), true, "the old header can't be forged into a read");
  assert.equal(isWriteRequest(h({ [READ_HEADER]: "forged" })), true);
  assert.equal(isWriteRequest(h({ [READ_HEADER]: readMarker("another-secret".padEnd(48, "y")) })), true, "a mark made with another secret");
  assert.equal(isWriteRequest(h({ [READ_HEADER]: readMarker(), "next-action": "abc" })), true, "a server action is always a change");
});

test("the proxy sets the read mark on GET and HEAD only, and strips any copy a client sends", async () => {
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("../src/proxy");
  const { readMarker, READ_HEADER } = await import("../src/lib/read-marker");
  const forwarded = (res: Response) => res.headers.get(`x-middleware-request-${READ_HEADER}`);
  assert.equal(forwarded(proxy(new NextRequest("https://floortest.app/dashboard/floor", { headers: { [READ_HEADER]: "client" } }))), readMarker());
  assert.equal(forwarded(proxy(new NextRequest("https://floortest.app/dashboard/floor", { method: "HEAD" }))), readMarker());
  assert.equal(forwarded(proxy(new NextRequest("https://floortest.app/dashboard/floor", { method: "POST", body: new FormData(), headers: { [READ_HEADER]: readMarker() } }))), null, "a POST never carries it, even if sent");
});
