import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Rule 5 (audit 27 Oct): no other site may read our API (no CORS opening) or make a signed-in browser change something.
const OWN = "https://floortest.app";
const ALSO = ["https://floortest.app", "https://ops.floortest.app"];

test("another site's page can't POST, PUT, PATCH or DELETE to the API", async () => {
  const { crossSiteWrite } = await import("../src/lib/cross-site");
  const h = (o: Record<string, string>) => new Headers(o);
  for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
    assert.equal(crossSiteWrite(method, h({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }), OWN, ALSO), true, `${method} from another site`);
    assert.equal(crossSiteWrite(method, h({ "sec-fetch-site": "same-site", origin: "https://x.floortest.app" }), OWN, ALSO), true, `${method} from another subdomain`);
    assert.equal(crossSiteWrite(method, h({ origin: "https://evil.example" }), OWN, ALSO), true, `${method}, older browser, another site`);
    assert.equal(crossSiteWrite(method, h({ origin: "null" }), OWN, ALSO), true, `${method}, sandboxed page`);
    assert.equal(crossSiteWrite(method, h({ "sec-fetch-site": "same-origin", origin: OWN }), OWN, ALSO), false, `${method} from our page`);
    assert.equal(crossSiteWrite(method, h({ origin: "https://ops.floortest.app" }), OWN, ALSO), false, `${method}, older browser, ops`);
    assert.equal(crossSiteWrite(method, h({}), OWN, ALSO), false, `${method} with no browser headers (app, webhook, one-click unsubscribe)`);
  }
  for (const method of ["GET", "HEAD", "OPTIONS"])
    assert.equal(crossSiteWrite(method, h({ "sec-fetch-site": "cross-site", origin: "https://evil.example" }), OWN, ALSO), false, `${method} changes nothing`);
});

test("the proxy answers a cross-site API write 403 before any route runs", async () => {
  Object.assign(process.env, { SITE_PASSWORD: "", OPS_URL: "", APP_URL: OWN });
  const { NextRequest } = await import("next/server");
  const { proxy } = await import("../src/proxy");
  const req = (headers: Record<string, string>, method = "POST", url = `${OWN}/api/v1/tracks/1/decision`) => proxy(new NextRequest(url, { method, headers }));
  const refused = req({ "sec-fetch-site": "cross-site", origin: "https://evil.example" });
  assert.equal(refused.status, 403);
  assert.match(refused.headers.get("content-security-policy") ?? "", /frame-ancestors 'none'/, "the refusal still carries the CSP");
  assert.notEqual(req({ "sec-fetch-site": "same-origin", origin: OWN }).status, 403);
  assert.notEqual(req({}).status, 403, "the phone app and webhooks send no browser headers");
  assert.notEqual(req({ "sec-fetch-site": "cross-site" }, "GET", `${OWN}/api/health`).status, 403, "reading is untouched");
});

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.(tsx?|json|mjs)$/.test(e.name) ? [p] : [];
  });
}

test("nothing opens the API to other sites (no Access-Control-Allow-Origin anywhere)", () => {
  const root = path.join(import.meta.dirname, "..");
  const hits = [...files(path.join(root, "src")), path.join(root, "next.config.ts"), path.join(root, "vercel.json")].filter((f) =>
    /access-control-allow-(origin|credentials)/i.test(fs.readFileSync(f, "utf8")),
  );
  assert.deepEqual(hits.map((f) => path.relative(root, f)), []);
});
