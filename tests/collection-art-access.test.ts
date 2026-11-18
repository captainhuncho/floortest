import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";
import { inRequest, type Jar } from "./request-scope";
import { agreeTerms } from "./agree-terms";

// A callout's own artwork is the cover the players show for its tracks (18 Nov). Everyone working the desk must get it,
// owner and teammates alike; nobody else may, unless it's the callout the public link is receiving into.
process.env.DATA_DIR = testDataDir("ft-collection-art-access-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.S3_BUCKET;
delete process.env.VERCEL_ENV;

let n = 0;
async function person(plan = "free") {
  const { q, now } = await import("../src/lib/db");
  n++;
  const id = Number((await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at, email_verified_at, totp_enabled_at) VALUES (?, 'h', ?, ?, ?, 'dj', 'UTC', ?, ?, ?) RETURNING id",
    `ca${n}@example.test`, `Person ${n}`, `causer${n}`, plan, now(), now(), now(),
  ))!.id);
  await agreeTerms(id);
  return id;
}

/** A callout on `owner`'s desk with stored artwork. */
async function calloutWithArt(owner: number) {
  const { q, now } = await import("../src/lib/db");
  const { storage } = await import("../src/lib/storage");
  const { recordDigest } = await import("../src/lib/file-digests");
  n++;
  const key = `collection-art/test-${n}.webp`;
  const bytes = new Uint8Array(64).fill(n);
  await (await storage()).put(key, bytes, "image/webp");
  await recordDigest(key, bytes);
  return Number((await q.get<{ id: number }>(
    "INSERT INTO collections (user_id, name, art_key, created_at) VALUES (?, ?, ?, ?) RETURNING id",
    owner, `Callout ${n}`, key, now(),
  ))!.id);
}

async function signIn(userId: number, deskId?: number) {
  const { createSession } = await import("../src/lib/auth");
  const jar: Jar = new Map();
  await inRequest(jar, "10.9.0.2", () => createSession(userId));
  if (deskId) jar.set("ft_desk", String(deskId));
  return jar;
}

async function cover(jar: Jar, id: number) {
  const { GET } = await import("../src/app/api/collection-art/[id]/route");
  const req = new Request(`http://localhost/api/collection-art/${id}?v=x`);
  const out = await inRequest(jar, "10.9.0.2", () => GET(req, { params: Promise.resolve({ id: String(id) }) } as never), { dropAfter: true });
  return (out.answer as Response).status;
}

test("a callout's cover reaches the owner and every teammate on the desk, and nobody else", async () => {
  const { q, now } = await import("../src/lib/db");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('teams', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", now());
  const owner = await person("team");
  const admin = await person();
  const member = await person();
  const stranger = await person();
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'admin', ?)", owner, admin, now());
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', ?)", owner, member, now());
  const callout = await calloutWithArt(owner);

  assert.equal(await cover(await signIn(owner), callout), 200, "the owner");
  assert.equal(await cover(await signIn(admin, owner), callout), 200, "an A&R / Admin working the desk");
  assert.equal(await cover(await signIn(member, owner), callout), 200, "a Member working the desk");
  assert.equal(await cover(await signIn(member), callout), 404, "the same Member on their own desk");
  assert.equal(await cover(await signIn(stranger, owner), callout), 404, "a stranger naming the desk in the cookie");
  assert.equal(await cover(new Map(), callout), 404, "signed out");
});
