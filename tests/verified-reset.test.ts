import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";
import { form, inRequest, type Jar } from "./request-scope";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-verified-reset-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;
delete process.env.SITE_PASSWORD;

test("the Verified mark goes when the link it was checked against changes", async () => {
  const { q } = await import("../src/lib/db");
  const { changeHandle, resetVerified } = await import("../src/lib/accounts");
  const t = Date.now();
  const id = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at, identity_status, identity_verified_at) VALUES ('v@x.io', 'h', 'Real DJ', 'realdj', 'pro', 'UTC', ?, ?, 'verified', ?) RETURNING id",
    t, t, t,
  ))!.id;
  const status = async () => (await q.get<{ s: string; at: number | null }>("SELECT identity_status AS s, identity_verified_at AS at FROM users WHERE id = ?", id))!;
  assert.equal(await changeHandle(id, "realdj"), null, "keeping the same link changes nothing");
  assert.equal((await status()).s, "verified");
  assert.equal(await changeHandle(id, "famousdj"), null);
  assert.deepEqual(await status(), { s: "rejected", at: null }, "a new link needs checking again");
  assert.equal(await resetVerified(q, id), false, "only a verified account is reset");
});

test("saving profiles keeps the Verified mark for the same profile typed another way, and takes it for a different one", async () => {
  const { q } = await import("../src/lib/db");
  const { resetIfProfilesChanged } = await import("../src/lib/accounts");
  const { slotLink } = await import("../src/lib/socials");
  const t = Date.now();
  const id = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at, identity_status, identity_verified_at, links) VALUES ('imss@x.io', 'h', 'IMSS', 'imssrecords', 'pro', 'UTC', ?, ?, 'verified', ?, ?) RETURNING id",
    t, t, t, JSON.stringify([{ platform: "instagram", url: "https://www.instagram.com/imssrecords/" }]),
  ))!.id;
  const status = async () => (await q.get<{ s: string }>("SELECT identity_status AS s FROM users WHERE id = ?", id))!.s;
  const link = (raw: string) => slotLink("instagram", raw) as { platform: "instagram"; url: string };
  const saved = async () => (await q.get<{ links: string }>("SELECT links FROM users WHERE id = ?", id))!.links;
  // The action's own two steps, in its order: the column before the save decides (updatePublicPage).
  assert.equal(await resetIfProfilesChanged(id, await saved(), [link("@imssrecords")]), false, "re-typed, same profile");
  assert.equal(await resetIfProfilesChanged(id, await saved(), [link("https://instagram.com/IMSSRecords?igsh=x")]), false);
  assert.equal(await status(), "verified");
  assert.equal(await resetIfProfilesChanged(id, await saved(), [link("@imss.records")]), true, "a different profile");
  assert.equal(await status(), "rejected");
});

test("the Public page save itself keeps the mark for a re-typed profile and takes it for a different one (Safety, PR 510)", async () => {
  const { q } = await import("../src/lib/db");
  const { createSession } = await import("../src/lib/auth");
  const { updatePublicPage } = await import("../src/app/dashboard/actions/settings");
  const t = Date.now();
  const id = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at, identity_status, identity_verified_at, links) VALUES ('page@x.io', 'h', 'Page DJ', 'pagedj', 'pro', 'UTC', ?, ?, 'verified', ?, ?) RETURNING id",
    t, t, t, JSON.stringify([{ platform: "instagram", url: "instagram.com/pagedj" }]),
  ))!.id;
  const jar: Jar = new Map();
  await inRequest(jar, "10.9.0.1", () => createSession(id));
  const save = (url: string) => inRequest(jar, "10.9.0.1", () => updatePublicPage(undefined, form({ page_style: "classic", platform: "instagram", url })), { dropAfter: true });
  const status = async () => (await q.get<{ s: string }>("SELECT identity_status AS s FROM users WHERE id = ?", id))!.s;

  assert.deepEqual(await save("https://www.instagram.com/PageDJ/?igsh=abc"), { answer: { ok: true } });
  assert.equal(await status(), "verified", "the same profile, typed another way");
  assert.deepEqual(await save("@pagedj"), { answer: { ok: true } });
  assert.equal(await status(), "verified");
  assert.deepEqual(await save("@page.dj"), { answer: { ok: true } });
  assert.equal(await status(), "rejected", "a different profile needs checking again");
});
