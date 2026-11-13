import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { testDataDir } from "./test-db";
import { inRequest, type Jar } from "./request-scope";

// The real route handler, signed in through real sessions in a request scope the test controls.
process.env.DATA_DIR = testDataDir("ft-callout-card-route-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.ADMIN_EMAILS = "staff@x.io";
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.SITE_PASSWORD;

let serial = 0;
const load = async () => ({
  ...(await import("../src/lib/db")),
  ...(await import("../src/lib/auth")),
  GET: (await import("../src/app/api/callout-card/[id]/route")).GET,
  POST: (await import("../src/app/api/callout-card/[id]/route")).POST,
});

async function account(opts: { verified?: boolean; email?: string } = {}) {
  const { q } = await load();
  const t = Date.now();
  const handle = `routedj${++serial}`;
  const email = opts.email ?? `${handle}@x.io`;
  const id = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, email_verified_at, created_at) VALUES (?, 'h', 'Route Test', ?, 'pro', 'UTC', ?, ?) RETURNING id",
    email, handle, opts.verified === false ? null : t, t,
  ))!.id;
  return id;
}
async function callout(userId: number, active = true) {
  const { q } = await load();
  const id = (await q.get<{ id: number }>("INSERT INTO collections (user_id, name, created_at) VALUES (?, 'Villagers', ?) RETURNING id", userId, Date.now()))!.id;
  if (active) await q.run("UPDATE users SET active_collection_id = ? WHERE id = ?", id, userId);
  return id;
}
async function signIn(userId: number) {
  const { createSession } = await load();
  const jar: Jar = new Map();
  await inRequest(jar, "10.8.0.1", () => createSession(userId));
  return jar;
}
async function call(jar: Jar, id: string | number, query = "?format=story") {
  const { GET } = await load();
  const out = await inRequest(jar, "10.8.0.1", () => GET(new Request(`http://localhost/api/callout-card/${id}${query}`), { params: Promise.resolve({ id: String(id) }) } as never), { dropAfter: true });
  return out.answer as Response;
}

async function post(jar: Jar, id: string | number, body: string) {
  const { POST } = await load();
  const req = new Request(`http://localhost/api/callout-card/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body });
  const out = await inRequest(jar, "10.8.0.1", () => POST(req, { params: Promise.resolve({ id: String(id) }) } as never), { dropAfter: true });
  return out.answer as Response;
}

test("a note comes in the body: 80 characters gives the card, 81 or a huge body is refused, signed out is still 401", async () => {
  const id = await account();
  const jar = await signIn(id);
  const c = await callout(id);
  const ok = await post(jar, c, JSON.stringify({ format: "square", note: "é".repeat(80) }));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/png");
  assert.equal((await post(jar, c, JSON.stringify({ format: "square", note: "x".repeat(81) }))).status, 400);
  assert.equal((await post(jar, c, JSON.stringify({ format: "square", note: "x".repeat(5000) }))).status, 413);
  assert.equal((await post(jar, c, "not json")).status, 400);
  assert.equal((await post(jar, c, JSON.stringify({ format: "poster", note: "hi" }))).status, 400);
  assert.equal((await post(jar, c, JSON.stringify({ format: "story" }))).status, 200, "no note is the plain card");
  assert.equal((await post(new Map(), c, JSON.stringify({ format: "story", note: "hi" }))).status, 401);
});

test("signed out is 401, unconfirmed email is 403", async () => {
  assert.equal((await call(new Map(), 1)).status, 401);
  const id = await account({ verified: false });
  assert.equal((await call(await signIn(id), await callout(id))).status, 403);
});

test("another account's id, a missing id and a bad id all answer the same 404", async () => {
  const me = await signIn(await account());
  const other = await callout(await account());
  const answers = await Promise.all([other, 999_999_999, "abc", "1e3", "-1"].map((id) => call(me, id)));
  for (const r of answers) {
    assert.equal(r.status, 404);
    assert.equal(await r.text(), "Not found");
  }
});

test("a teammate on the desk gets 404", async () => {
  const { q } = await load();
  const owner = await account();
  const c = await callout(owner);
  const mate = await account();
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?)", owner, mate, Date.now());
  const jar = await signIn(mate);
  jar.set("ft_desk", String(owner));
  assert.equal((await call(jar, c)).status, 404);
});

test("staff viewing an account get 404", async () => {
  const { q, signViewAs, VIEW_AS_COOKIE } = await load();
  const owner = await account();
  const c = await callout(owner);
  const staff = await account({ email: "staff@x.io" });
  const t = Date.now();
  await q.run("UPDATE users SET totp_enabled_at = ? WHERE id = ?", t, staff);
  const session = crypto.randomBytes(32).toString("hex");
  await q.run("INSERT INTO admin_sessions (token_hash, user_id, expires_at, created_at, last_seen_at) VALUES (?,?,?,?,?)", session, staff, t + 3_600_000, t, t);
  const jar = await signIn(owner);
  jar.set(VIEW_AS_COOKIE, signViewAs(staff, owner, session, process.env.APP_SECRET!));
  assert.equal((await call(jar, c)).status, 404);
});

test("a missing or unknown format is 400, and no size or quality is taken", async () => {
  const id = await account();
  const c = await callout(id);
  const jar = await signIn(id);
  for (const q of ["", "?format=", "?format=huge", "?format=STORY"]) assert.equal((await call(jar, c, q)).status, 400, q);
});

test("closed, full, paused and not-active callouts are 409 with the reason", async () => {
  const { q } = await load();
  const reason = async (r: Response) => [r.status, ((await r.json()) as { reason: string }).reason];
  const id = await account();
  const c = await callout(id);
  const jar = await signIn(id);
  await q.run("UPDATE collections SET closes_at = ? WHERE id = ?", Date.now() - 1000, c);
  assert.deepEqual(await reason(await call(jar, c)), [409, "closed"]);
  await q.run("UPDATE collections SET closes_at = NULL, full_at = ? WHERE id = ?", Date.now(), c);
  assert.deepEqual(await reason(await call(jar, c)), [409, "full"]);
  await q.run("UPDATE collections SET full_at = NULL WHERE id = ?", c);
  await q.run("UPDATE users SET paused_at = ? WHERE id = ?", Date.now(), id);
  assert.deepEqual(await reason(await call(jar, c)), [409, "paused"]);
  await q.run("UPDATE users SET paused_at = NULL WHERE id = ?", id);
  assert.deepEqual(await reason(await call(jar, await callout(id, false))), [409, "unavailable"]);
});

test("an open callout gives a private PNG with a fixed filename", async () => {
  const id = await account();
  const jar = await signIn(id);
  const r = await call(jar, await callout(id), "?format=square");
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.equal(r.headers.get("cache-control"), "private, no-store");
  assert.equal(r.headers.get("content-disposition"), 'attachment; filename="floortest-callout-square.png"');
  assert.ok((await r.arrayBuffer()).byteLength > 1000);
});

const photoBytes = (colour: string) => sharp({ create: { width: 800, height: 800, channels: 3, background: colour } }).jpeg().toBuffer();
async function storedPhoto(name: string, bytes: Uint8Array) {
  const { storage } = await import("../src/lib/storage");
  const key = `card-test/${++serial}-${name}`;
  await (await storage()).put(key, bytes, "image/jpeg");
  return key;
}
const quarantine = async (key: string) => (await load()).q.run("INSERT INTO file_digests (file_key, sha256, size, checked_at, status) VALUES (?, '', 0, ?, 'mismatch')", key, Date.now());
/** The colour at the centre of the mailer's window, which shows the photo or the blank card. */
const windowColour = async (r: Response) => {
  assert.equal(r.status, 200);
  const { data } = await sharp(Buffer.from(await r.arrayBuffer())).extract({ left: 57 + 490, top: 232 + 220, width: 1, height: 1 }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return [...data];
};
async function withPhotos(art: string | null, cover: string | null) {
  const { q } = await load();
  const id = await account();
  const c = await callout(id);
  await q.run("UPDATE collections SET art_key = ? WHERE id = ?", art, c);
  await q.run("UPDATE users SET cover_key = ? WHERE id = ?", cover, id);
  return call(await signIn(id), c);
}
const isRed = ([r, g, b]: number[]) => r > 180 && g < 80 && b < 80;
const isBlue = ([r, g, b]: number[]) => b > 180 && g < 80 && r < 80;

test("art is used first, a quarantined art_key falls to cover_key, both held gives the blank card", async () => {
  const red = await photoBytes("#e01010");
  const blue = await photoBytes("#1010e0");
  assert.ok(isRed(await windowColour(await withPhotos(await storedPhoto("a", red), await storedPhoto("c", blue)))));
  const heldArt = await storedPhoto("a", red);
  await quarantine(heldArt);
  assert.ok(isBlue(await windowColour(await withPhotos(heldArt, await storedPhoto("c", blue)))));
  const heldCover = await storedPhoto("c", blue);
  await quarantine(heldCover);
  const blank = await windowColour(await withPhotos(heldArt, heldCover));
  assert.ok(!isRed(blank) && !isBlue(blank));
});

test("corrupt or over-10 MB art still gives a card, from the next photo", async () => {
  const blue = await photoBytes("#1010e0");
  const corrupt = await storedPhoto("bad", Buffer.from("not an image"));
  assert.ok(isBlue(await windowColour(await withPhotos(corrupt, await storedPhoto("c", blue)))));
  const huge = await storedPhoto("huge", new Uint8Array(10 * 1024 * 1024 + 1));
  assert.ok(isBlue(await windowColour(await withPhotos(huge, await storedPhoto("c", blue)))));
});

test("with the site password on, a live callout still gets its card, and a suspended account gets none", async () => {
  const { q } = await load();
  const id = await account();
  const c = await callout(id);
  const jar = await signIn(id);
  process.env.SITE_PASSWORD = "gate";
  try {
    const gated = await call(jar, c);
    // Receiving links open without the password since #503, so the card's QR lands on a working page (owner, 11 Nov).
    assert.equal(gated.status, 200);
    assert.equal(gated.headers.get("content-type"), "image/png");
    const notActive = await call(jar, await callout(id, false));
    assert.deepEqual([notActive.status, await notActive.json()], [409, { reason: "unavailable" }], "a callout that isn't active stays unavailable behind the gate");
  } finally {
    delete process.env.SITE_PASSWORD;
  }
  await q.run("UPDATE users SET suspended_at = ? WHERE id = ?", Date.now(), id);
  assert.equal((await call(jar, c)).status, 401, "a suspended account's session stops working before the route's own check");
});

test("after 20 in a minute a person gets 429 with Retry-After", async () => {
  const id = await account();
  const jar = await signIn(id);
  for (let i = 0; i < 20; i++) assert.equal((await call(jar, 999_999_999)).status, 404);
  const r = await call(jar, 999_999_999);
  assert.equal(r.status, 429);
  assert.equal(r.headers.get("retry-after"), "60");
});

test("card text reaches the image only as path data, and the fonts stay server-side", () => {
  const render = fs.readFileSync(path.join(process.cwd(), "src/lib/callout-card/render.ts"), "utf8");
  for (const svg of render.match(/`<svg[^`]*`/g) ?? []) assert.ok(!/\$\{(text|fields|name|l\b|lines)/.test(svg), svg);
  const config = fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
  assert.match(config, /"\/api\/callout-card\/\[id\]": \[[^\]]*callout-card\/fonts[^\]]*Inter-Bold/);
  assert.equal(fs.existsSync(path.join(process.cwd(), "public/fonts")), false);
  for (const licence of ["OFL-instrument-serif.txt", "OFL-jetbrains-mono.txt", "OFL-NotoSans.txt", "OFL-NotoSansArabic.txt", "OFL-NotoSansHebrew.txt", "OFL-NotoSansDevanagari.txt", "OFL-NotoSansBengali.txt", "OFL-NotoSansTamil.txt", "OFL-NotoSansThai.txt", "OFL-NotoSansCJK.txt"]) assert.ok(fs.existsSync(path.join(process.cwd(), "src/lib/callout-card/fonts", licence)));
});
