import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");

// Safety audit M1 (6 Nov): an admin's "view as" must be read-only for every way in. Next.js runs a server action from a
// plain multipart form post without its Next-Action header, so the proxy refuses any change request carrying the view
// cookie, and auth.ts decides "is this a change?" from a header only the proxy sets.
test("a change request during view-as never reaches the page: plain form post, server action or JSON alike", async () => {
  const { NextRequest } = await import("next/server");
  const { proxy, VIEW_AS_COOKIE_NAME } = await import("../src/proxy");
  const set = fs.readFileSync("src/lib/auth.ts", "utf8").match(/export const VIEW_AS_COOKIE = "([^"]+)"/)?.[1];
  assert.equal(VIEW_AS_COOKIE_NAME, set, "the proxy names the same cookie auth.ts sets");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const body = new FormData();
    body.set("name", "Changed by admin");
    const req = new NextRequest("https://floortest.app/dashboard/settings", { method, body: method === "DELETE" ? null : body, headers: { cookie: `${VIEW_AS_COOKIE_NAME}=signed.value` } });
    const res = proxy(req);
    assert.equal(res.status, 303, `${method} is refused`);
    assert.match(res.headers.get("location") ?? "", /\/dashboard\/floor\?readonly=1$/);
  }
  // Reading still works, and so do starting and ending a view (both GETs).
  for (const path of ["/dashboard/settings", "/dashboard/exit-view"]) {
    const res = proxy(new NextRequest(`https://floortest.app${path}`, { headers: { cookie: `${VIEW_AS_COOKIE_NAME}=signed.value` } }));
    assert.notEqual(res.status, 303, `GET ${path} goes through`);
  }
  // Without the view cookie, a form post goes on as usual.
  const plain = proxy(new NextRequest("https://floortest.app/dashboard/settings", { method: "POST", body: new FormData() }));
  assert.notEqual(plain.status, 303);
});

test("the proxy marks every request as a change or not, overwriting anything a client sends", async () => {
  const { NextRequest } = await import("next/server");
  const { proxy, WRITE_HEADER } = await import("../src/proxy");
  const forwarded = (res: Response) => res.headers.get(`x-middleware-request-${WRITE_HEADER}`);
  assert.equal(forwarded(proxy(new NextRequest("https://floortest.app/dashboard/floor", { headers: { [WRITE_HEADER]: "1" } }))), "0", "a client's own value on a GET is replaced");
  assert.equal(forwarded(proxy(new NextRequest("https://floortest.app/dashboard/floor", { method: "POST", body: new FormData(), headers: { [WRITE_HEADER]: "0" } }))), "1");
});

test("auth.ts treats any change request as one, not only those with Next's header", () => {
  const src = fs.readFileSync("src/lib/auth.ts", "utf8");
  assert.match(src, /h\.get\("x-ft-write"\) === "1" \|\| !!h\.get\("next-action"\)/);
  assert.doesNotMatch(src.replace(/async function isWrite[\s\S]*?\n}\n/, ""), /get\("next-action"\)/, "no other next-action-only checks left");
  assert.match(fs.readFileSync("src/lib/audit.ts", "utf8"), /if \(view && view\.userId === userId\) return view\.adminId;/, "the log names the admin");
});
