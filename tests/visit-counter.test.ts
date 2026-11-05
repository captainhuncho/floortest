import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-visit-counter-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

const TOKEN = "Ab3dE6gH9jK2mN5pQ8sT1vW4yZ7_c-0x";
let ipN = 0;

async function send(body: Record<string, unknown> | string, headers: Record<string, string> = {}) {
  const { POST } = await import("../src/app/api/visit/route");
  const res = await POST(
    new Request("http://floortest.test/api/visit", {
      method: "POST",
      headers: {
        host: "floortest.test",
        "x-real-ip": `9.9.9.${++ipN % 250}`,
        "user-agent": "Mozilla/5.0 (iPhone) Safari/605",
        "content-type": "application/json",
        "sec-fetch-site": "same-origin",
        ...headers,
      },
      body: typeof body === "string" ? body : JSON.stringify(body),
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
  const v = { kind: "visit", path: "/pricing", ref: "www.instagram.com", device: "phone" };
  await send(v, { "x-vercel-ip-country": "gh" });
  await send(v, { "x-vercel-ip-country": "GH" });
  assert.deepEqual(await rows(), [{ kind: "visit", page: "/pricing", link_owner: null, country: "GH", source: "instagram.com", device: "phone", n: 2 }]);
});

test("utm_source wins, our own site counts as direct, and views carry no source", async () => {
  await reset();
  await send({ kind: "visit", path: "/", ref: "google.com", utm: "Newsletter_Nov" });
  await send({ kind: "visit", path: "/", ref: "floortest.test" });
  await send({ kind: "view", path: "/login", ref: "google.com" });
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
  await send({ kind: "visit", path: "/DJVisit", ref: "t.co" });
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

test("only our own pages can count: cross-site, non-JSON and oversized bodies are dropped", async () => {
  await reset();
  await send({ kind: "visit", path: "/" }, { "sec-fetch-site": "cross-site" });
  await send({ kind: "visit", path: "/" }, { "sec-fetch-site": "same-site" });
  await send({ kind: "visit", path: "/" }, { "content-type": "text/plain" });
  await send(JSON.stringify({ kind: "visit", path: "/", ref: "x".repeat(3000) }));
  assert.deepEqual(await rows(), []);
  await send({ kind: "visit", path: "/" }, { "sec-fetch-site": "" });
  await send({ kind: "visit", path: "/" }, { "sec-fetch-site": "", origin: "https://evil.example" });
  assert.deepEqual(await rows(), [], "no Sec-Fetch-Site needs an Origin of this host");
  await send({ kind: "visit", path: "/" }, { "sec-fetch-site": "", origin: "http://floortest.test" });
  assert.equal((await rows()).length, 1, "a browser that sends no Sec-Fetch-Site still counts from our own page");
});

test("a short key on a private page is still hidden", async () => {
  await reset();
  for (const p of ["/receipt/abc123", "/invite/K7Q2", "/c/xy9", "/join/a1"]) await send({ kind: "view", path: p });
  assert.deepEqual((await rows()).map((r) => r.page).sort(), ["/c/:token", "/invite/:token", "/join/:token", "/receipt/:token"]);
});

test("unknown routes count as /other, and a day keeps a bounded list of pages and sources", async () => {
  await reset();
  const { PAGES_A_DAY, SOURCES_A_DAY } = await import("../src/app/api/visit/route");
  await send({ kind: "view", path: "/wp-admin/setup.php" });
  await send({ kind: "view", path: "/dashboard/Some Free Text Here" });
  assert.deepEqual((await rows()).map((r) => r.page).sort(), ["/dashboard/:x", "/other"]);
  await reset();
  const { q } = await import("../src/lib/db");
  const day = new Date().toISOString().slice(0, 10);
  await q.run(
    "INSERT INTO visit_counts (day, kind, page, source) SELECT ?, 'visit', '/dashboard/p' || g, 's' || g FROM generate_series(1, ?) g",
    day,
    Math.max(PAGES_A_DAY, SOURCES_A_DAY),
  );
  await send({ kind: "visit", path: "/dashboard/brandnew", utm: "brandnewsource" });
  const added = await q.get<{ page: string; source: string }>("SELECT page, source FROM visit_counts WHERE page NOT LIKE '/dashboard/p%'");
  assert.deepEqual(added, { page: "/other", source: "other" });
});

test("each rate limit drops the extra beacons", async () => {
  const { q } = await import("../src/lib/db");
  const { VIEWS_PER_IP_A_DAY, VIEWS_A_DAY } = await import("../src/app/api/visit/route");
  const count = async () => (await q.get<{ n: number }>("SELECT COALESCE(SUM(n), 0)::int AS n FROM visit_counts"))!.n;
  await reset();
  for (let i = 0; i < 32; i++) await send({ kind: "view", path: "/" }, { "x-real-ip": "5.5.5.5" });
  assert.equal(await count(), 30, "30 a minute per connection");
  await reset();
  await q.run("TRUNCATE rate_events");
  const t = Date.now();
  await q.run("INSERT INTO rate_events (bucket, key, created_at) SELECT 'visit_ip_day', '6.6.6.6', ? FROM generate_series(1, ?)", t - 3_600_000, VIEWS_PER_IP_A_DAY);
  await send({ kind: "view", path: "/" }, { "x-real-ip": "6.6.6.6" });
  assert.equal(await count(), 0, "a day's share per connection");
  await q.run("INSERT INTO rate_events (bucket, key, created_at) SELECT 'visit_all', 'all', ? FROM generate_series(1, ?)", t - 3_600_000, VIEWS_A_DAY);
  await send({ kind: "view", path: "/" }, { "x-real-ip": "6.6.6.7" });
  assert.equal(await count(), 0, "the site-wide day cap");
  await q.run("TRUNCATE rate_events");
});

test("a suspended receiver's link counts against nobody, and a deleted account takes its counts", async () => {
  await reset();
  const { q } = await import("../src/lib/db");
  const t = Date.now();
  const sus = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at, suspended_at) VALUES ('s@x.io','h','S','djsus','pro','UTC',?,?,?) RETURNING id", t, t, t))!.id;
  const live = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('l@x.io','h','L','djlive','pro','UTC',?,?) RETURNING id", t, t))!.id;
  await send({ kind: "visit", path: "/djsus" });
  await send({ kind: "visit", path: "/djlive" });
  assert.deepEqual((await rows()).map((r) => r.link_owner).sort(), [live, null].sort());
  await q.run("DELETE FROM users WHERE id = ?", live);
  assert.deepEqual((await rows()).map((r) => r.link_owner), [null]);
  await q.run("DELETE FROM users WHERE id = ?", sus);
});

test("counts older than 400 days are cleared by the nightly clean-up", async () => {
  await reset();
  const { q } = await import("../src/lib/db");
  const { cleanupRecords } = await import("../src/lib/retention");
  const old = new Date(Date.now() - 401 * 86_400_000).toISOString().slice(0, 10);
  const kept = new Date(Date.now() - 399 * 86_400_000).toISOString().slice(0, 10);
  await q.run("INSERT INTO visit_counts (day, kind, page) VALUES (?, 'visit', '/'), (?, 'visit', '/')", old, kept);
  await cleanupRecords();
  assert.deepEqual((await q.all<{ day: string }>("SELECT day FROM visit_counts")).map((r) => r.day), [kept]);
});

test("junk doesn't spend the rate limits", async () => {
  await reset();
  const { q } = await import("../src/lib/db");
  await q.run("TRUNCATE rate_events");
  for (let i = 0; i < 40; i++) await send("not json", { "x-real-ip": "4.4.4.4" });
  for (let i = 0; i < 40; i++) await send({ kind: "view", path: "/" }, { "x-real-ip": "4.4.4.4", "sec-fetch-site": "cross-site" });
  assert.equal((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM rate_events"))!.n, 0);
  await send({ kind: "view", path: "/" }, { "x-real-ip": "4.4.4.4" });
  assert.equal((await rows()).length, 1);
});

test("a page that shadows a handle is never credited to whoever holds that handle", async () => {
  await reset();
  const { q } = await import("../src/lib/db");
  const { RESERVED_HANDLES } = await import("../src/lib/plans");
  const t = Date.now();
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('ck@x.io','h','C','cookies','pro','UTC',?,?)", t, t);
  await send({ kind: "visit", path: "/cookies" });
  assert.deepEqual((await rows()).map((r) => [r.page, r.link_owner]), [["/cookies", null]]);
  const fs = await import("node:fs");
  // Every top-level folder, looking inside route groups like (auth) at any depth of grouping.
  const walk = (dir: string): string[] =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !/^[[_]/.test(d.name))
      .flatMap((d) => (d.name.startsWith("(") ? walk(`${dir}/${d.name}`) : [d.name]));
  const top = walk("src/app");
  for (const name of top) assert.ok(RESERVED_HANDLES.has(name) || name === "fonts", `/${name} is a page, so its handle must be reserved`);
});

test("Ops → Visits needs the metrics permission", async () => {
  const { PAGE_NEEDS } = await import("../src/lib/ops-perms");
  assert.equal(PAGE_NEEDS["/admin/visits"], "metrics");
  const fs = await import("node:fs");
  assert.match(fs.readFileSync("src/app/admin/visits/page.tsx", "utf8"), /await requireAdmin\("metrics"\)/);
});

test("the browser sends nothing before Accept, and never a key, a query or our own previous page", async () => {
  const { visitBeacon, referrerHost } = await import("../src/lib/visit-beacon");
  const base = { path: "/pricing", landing: true, referrer: "", search: "", host: "floortest.test", device: "phone" };
  for (const consent of ["pending", "rejected", "", "null"]) assert.equal(visitBeacon({ ...base, consent }), null, `nothing for ${consent || "no choice"}`);
  assert.ok(visitBeacon({ ...base, consent: "accepted" }));
  const sent = JSON.parse(visitBeacon({ ...base, consent: "accepted", path: "/receipt/abc123", referrer: "https://floortest.test/reset/Ab3dE6gH9jK2mN5pQ8sT1vW4yZ7_c-0x", search: "?utm_source=Mail&k=secret" })!);
  assert.deepEqual(sent, { kind: "visit", path: "/receipt/:token", device: "phone", ref: "", utm: "Mail" });
  assert.equal(referrerHost("https://www.news.example/story?id=9#top", "floortest.test"), "news.example");
  assert.equal(referrerHost("https://floortest.test:443/join/xyz", "floortest.test"), "");
  assert.equal(referrerHost("javascript:alert(1)", "floortest.test"), "");
  const later = JSON.parse(visitBeacon({ ...base, consent: "accepted", landing: false, referrer: "https://other.example/" })!);
  assert.deepEqual(Object.keys(later).sort(), ["device", "kind", "path"], "a view carries no referrer");
});

test("a full URL or a path in the referrer field is refused on the server too", async () => {
  await reset();
  await send({ kind: "visit", path: "/", ref: "https://floortest.test/reset/abc" });
  await send({ kind: "visit", path: "/", ref: "news.example/story" });
  assert.deepEqual((await rows()).map((r) => [r.source, r.n]), [["", 2]]);
});

test("a body over 2 KB is refused by its Content-Length and, when chunked, while it's read", async () => {
  await reset();
  await send({ kind: "visit", path: "/" }, { "content-length": "5000" });
  const { POST } = await import("../src/app/api/visit/route");
  // A body that never ends: reading it all (req.text()) would hang, so this passes only if reading stops at the cap.
  let pulled = 0;
  const chunk = new TextEncoder().encode("x".repeat(1024));
  const stream = new ReadableStream({
    pull(c) {
      pulled++;
      c.enqueue(chunk);
    },
  });
  await POST(
    new Request("http://floortest.test/api/visit", {
      method: "POST",
      headers: { host: "floortest.test", "content-type": "application/json", "sec-fetch-site": "same-origin", "x-real-ip": "3.3.3.3" },
      body: stream,
      duplex: "half",
    } as RequestInit),
  );
  assert.deepEqual(await rows(), []);
  assert.ok(pulled <= 4, `stopped reading after ${pulled} chunks`);
});

test("IPv6 connections share a rate limit per /64", async () => {
  const { connectionKey } = await import("../src/app/api/visit/route");
  assert.equal(connectionKey("2001:db8:1:2::5"), connectionKey("2001:0db8:0001:0002:aaaa:bbbb:cccc:1"));
  assert.notEqual(connectionKey("2001:db8:1:2::5"), connectionKey("2001:db8:1:3::5"));
  assert.equal(connectionKey("::1"), "0:0:0:0::/64");
  assert.equal(connectionKey("9.9.9.9"), "9.9.9.9");
});

test("an account that already holds a newly reserved name can still save Settings", async () => {
  const { q } = await import("../src/lib/db");
  const { changeHandle } = await import("../src/lib/accounts");
  const t = Date.now();
  const holder = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('sec@x.io','h','S','security','pro','UTC',?,?) RETURNING id", t, t))!.id;
  const other = (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('o@x.io','h','O','otherdj','pro','UTC',?,?) RETURNING id", t, t))!.id;
  assert.equal(await changeHandle(holder, "security"), null, "keeping it is not a change");
  assert.equal(await changeHandle(other, "takedown"), "That link name is reserved.", "nobody new can take one");
});

test("the browser reduces every path the way the server does before sending", async () => {
  const { visitBeacon, browserPage } = await import("../src/lib/visit-beacon");
  const KEY = "Zq8wX3vB6nM1kL4jH7gF2dS5aP0oI9uY";
  const raw = (path: string) => JSON.parse(visitBeacon({ consent: "accepted", path, landing: false, referrer: "", search: "", host: "floortest.test", device: "phone" })!).path as string;
  for (const p of [`/share/${KEY}`, `/confirm-sender/${KEY}`, `/x/abcdefghij0123456789`, `/s/${KEY}`, `/v/${KEY}`]) {
    const sent = raw(p);
    assert.ok(!sent.includes(KEY.slice(0, 8)) && !sent.includes("abcdefghij"), `${p} sent as ${sent}`);
  }
  assert.equal(raw(`/share/${KEY}`), "/other");
  assert.equal(raw(`/dashboard/review?token=${KEY}`), "/dashboard/review", "a query never leaves");
  assert.equal(raw("/DJKwame?x=1"), "/djkwame", "a receiving link is sent as its handle alone");
  assert.equal(browserPage("/not a handle!"), "/other");
  assert.equal(raw("/dashboard/collections/42"), "/dashboard/collections/:id");
});

test("what the browser sends is stored as the same page", async () => {
  await reset();
  const { browserPage } = await import("../src/lib/visit-beacon");
  for (const p of ["/receipt/abc123", "/dashboard/collections/42", "/dashboard/Some Thing", "/share/zzzzzzzzzzzzzzzzzzzzzzzz", "/pricing"]) await send({ kind: "view", path: browserPage(p) });
  assert.deepEqual((await rows()).map((r) => r.page).sort(), ["/dashboard/:x", "/dashboard/collections/:id", "/other", "/pricing", "/receipt/:token"]);
});

test("two IPv6 addresses in one /64 share the per-minute limit", async () => {
  await reset();
  const { q } = await import("../src/lib/db");
  await q.run("TRUNCATE rate_events");
  for (let i = 0; i < 20; i++) await send({ kind: "view", path: "/" }, { "x-real-ip": "2001:db8:aa:bb::1" });
  for (let i = 0; i < 20; i++) await send({ kind: "view", path: "/" }, { "x-real-ip": "2001:db8:aa:bb:ffff::2" });
  assert.equal((await q.get<{ n: number }>("SELECT COALESCE(SUM(n), 0)::int AS n FROM visit_counts"))!.n, 30);
  await send({ kind: "view", path: "/" }, { "x-real-ip": "2001:db8:aa:cc::1" });
  assert.equal((await q.get<{ n: number }>("SELECT COALESCE(SUM(n), 0)::int AS n FROM visit_counts"))!.n, 31, "another /64 has its own");
  await q.run("TRUNCATE rate_events");
});

test("a bot, a non-JSON body and an oversized body never take a rate-limit slot", async () => {
  await reset();
  const { q } = await import("../src/lib/db");
  await q.run("TRUNCATE rate_events");
  await send({ kind: "view", path: "/" }, { "user-agent": "Googlebot/2.1" });
  await send({ kind: "view", path: "/" }, { "content-type": "text/plain" });
  await send({ kind: "view", path: "/" }, { "content-length": "5000" });
  await send(JSON.stringify({ kind: "view", path: "/", device: "x".repeat(3000) }));
  assert.equal((await q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM rate_events"))!.n, 0);
  assert.deepEqual(await rows(), []);
});

test("an IPv4 address written as IPv6 counts as that IPv4 address", async () => {
  const { connectionKey } = await import("../src/app/api/visit/route");
  assert.equal(connectionKey("::ffff:9.8.7.6"), "9.8.7.6");
});
