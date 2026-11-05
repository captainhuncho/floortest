import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-visit-counter-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

const TOKEN = "Ab3dE6gH9jK2mN5pQ8sT1vW4yZ7_c-0x";
let ipN = 0;

async function send(body: Record<string, unknown>, headers: Record<string, string> = {}) {
  const { POST } = await import("../src/app/api/visit/route");
  const res = await POST(
    new Request("http://floortest.test/api/visit", {
      method: "POST",
      headers: { host: "floortest.test", "x-real-ip": `9.9.9.${++ipN % 250}`, "user-agent": "Mozilla/5.0 (iPhone) Safari/605", ...headers },
      body: JSON.stringify(body),
    }),
  );
  assert.equal(res.status, 204);
}

async function rows() {
  const { q } = await import("../src/lib/db");
  return q.all<{ kind: string; page: string; link_owner: number | null; country: string; source: string; device: string; n: number }>(
    "SELECT kind, page, link_owner, country, source, device, n FROM visit_counts ORDER BY kind, page, source",
  );
}

async function reset() {
  const { q } = await import("../src/lib/db");
  await q.run("TRUNCATE visit_counts");
}

test("a visit is counted by page, country, source and device, and repeats add up", async () => {
  await reset();
  const v = { kind: "visit", path: "/pricing", ref: "https://www.instagram.com/p/xyz?igsh=abc", device: "phone" };
  await send(v, { "x-vercel-ip-country": "gh" });
  await send(v, { "x-vercel-ip-country": "GH" });
  assert.deepEqual(await rows(), [{ kind: "visit", page: "/pricing", link_owner: null, country: "GH", source: "instagram.com", device: "phone", n: 2 }]);
});

test("utm_source wins, our own site counts as direct, and views carry no source", async () => {
  await reset();
  await send({ kind: "visit", path: "/", ref: "https://google.com/", utm: "Newsletter_Nov" });
  await send({ kind: "visit", path: "/", ref: "https://floortest.test/login" });
  await send({ kind: "view", path: "/login", ref: "https://google.com/" });
  const r = await rows();
  assert.deepEqual(
    r.map((x) => [x.kind, x.page, x.source]),
    [
      ["view", "/login", ""],
      ["visit", "/", ""],
      ["visit", "/", "newsletter_nov"],
    ],
  );
});

test("private link keys are never stored, only the page", async () => {
  await reset();
  for (const r of ["c", "receipt", "join", "sent"]) await send({ kind: "view", path: `/${r}/${TOKEN}?k=${TOKEN}` });
  const pages = (await rows()).map((x) => x.page);
  assert.equal(pages.length, 4);
  for (const p of pages) {
    assert.ok(!p.includes(TOKEN.slice(0, 12)), `no key in ${p}`);
    assert.match(p, /\/:token$/);
  }
});

test("a receiving link is counted against its receiver; an unknown one against nobody", async () => {
  await reset();
  const { q } = await import("../src/lib/db");
  const t = Date.now();
  const uid = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('v@x.io','h','V','djvisit','pro','UTC',?,?) RETURNING id", t, t))!.id;
  await send({ kind: "visit", path: "/DJVisit", ref: "https://t.co/abc" });
  await send({ kind: "visit", path: "/nobodyhere" });
  const r = await rows();
  assert.deepEqual(
    r.map((x) => [x.page, x.link_owner, x.source]),
    [
      ["/:link", null, ""],
      ["/:link", uid, "t.co"],
    ],
  );
});

test("bots, bad input and odd countries are dropped or blanked, and no IP is kept", async () => {
  await reset();
  await send({ kind: "visit", path: "/" }, { "user-agent": "Googlebot/2.1" });
  await send({ kind: "visit", path: "https://evil.example/" });
  await send({ kind: "visit", path: "/", ref: "javascript:alert(1)", device: "fridge" }, { "x-vercel-ip-country": "<script>" });
  assert.deepEqual(await rows(), [{ kind: "visit", page: "/", link_owner: null, country: "", source: "", device: "", n: 1 }]);
  const { q } = await import("../src/lib/db");
  const cols = (await q.all<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'visit_counts'")).map((c) => c.column_name);
  assert.deepEqual(cols.sort(), ["country", "day", "device", "kind", "link_owner", "n", "page", "source"]);
});
