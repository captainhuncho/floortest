import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// Invite codes and newsletter tokens are stored only as hashes (owner, 11 Nov; migration 0140). A throwaway local
// database for this test only, set before the app's modules load; no email provider, so nothing is sent.
process.env.DATA_DIR = testDataDir("ft-hashed-codes-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("SQL's hash is the app's hash, so 0140's fill matches every lookup", async () => {
  const { q } = await import("../src/lib/db");
  const { hashToken } = await import("../src/lib/token-hash");
  const row = await q.get<{ h: string }>("SELECT encode(sha256(convert_to(?, 'UTF8')), 'hex') AS h", "FLOOR-ABCDEFGHJK");
  assert.equal(row!.h, hashToken("FLOOR-ABCDEFGHJK"));
});

test("a new personal invite stores no code, only its hash and last 4, and still opens sign-up", async () => {
  const { q } = await import("../src/lib/db");
  const { inviteKeys, newInviteCode, resolveInvite, liveInviteCode, personalInviteGone, claimPersonalInvite } = await import("../src/lib/invites");
  const { hashToken } = await import("../src/lib/token-hash");
  const code = newInviteCode();
  assert.match(code, /^FLOOR-[A-Z2-9]{16}$/, "16 random characters (80 bits), so the hash can't be reversed by trying");
  const k = inviteKeys(code);
  await q.run("INSERT INTO invites (code, code_hash, code_hint, max_uses, note, email, created_at) VALUES (?,?,?,1,'','new@x.io',?)", k.code, k.codeHash, k.hint, Date.now());

  const stored = await q.get<Record<string, unknown>>("SELECT code, code_hash, code_hint FROM invites WHERE email = 'new@x.io'");
  assert.ok(!JSON.stringify(stored).includes(code), "the code itself is nowhere in the row");
  assert.equal(stored!.code_hash, hashToken(code));
  assert.equal(stored!.code_hint, code.slice(-4));

  assert.equal(await liveInviteCode(code.toLowerCase()), true, "the emailed code opens the coming-soon gate (any case)");
  assert.equal(await liveInviteCode(k.code), false, "the stored hash doesn't work as a code");
  const r = await resolveInvite(code, "new@x.io", false);
  assert.deepEqual(r, { valid: true, referrerId: null, code: k.code, personal: true }, "what's recorded on the account is the hash");
  assert.equal((await resolveInvite(k.code, "new@x.io", false)).valid, false, "typing the hash opens nothing");
  assert.equal((await resolveInvite(code, "other@x.io", false)).valid, false, "only for its own email");

  assert.equal(await claimPersonalInvite(q, r.code, "new@x.io"), true);
  assert.equal(await personalInviteGone(code), true, "once used, the link says used or expired");
});

test("an invite with no hash (written by the older build during a deploy) is still found by its code", async () => {
  const { q } = await import("../src/lib/db");
  const { resolveInvite } = await import("../src/lib/invites");
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) VALUES ('FLOOR-OLDBUILD23456', 1, '', 'old@x.io', ?)", Date.now());
  assert.equal((await resolveInvite("FLOOR-OLDBUILD23456", "old@x.io", false)).code, "FLOOR-OLDBUILD23456");
});

test("an invite filled by 0140 is found by its hash; injection-shaped codes match nothing", async () => {
  const { q } = await import("../src/lib/db");
  const { resolveInvite } = await import("../src/lib/invites");
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at) VALUES ('FLOOR-FILLED234567', 1, '', 'filled@x.io', ?)", Date.now());
  await q.run("UPDATE invites SET code_hash = encode(sha256(convert_to(code, 'UTF8')), 'hex'), code = 'renamed-id' WHERE code = 'FLOOR-FILLED234567'");
  assert.equal((await resolveInvite("FLOOR-FILLED234567", "filled@x.io", false)).code, "renamed-id", "found by the hash, not the code column");
  for (const bad of ["' OR 1=1 --", "%", "renamed-id"]) assert.equal((await resolveInvite(bad, "filled@x.io", false)).valid, false, bad);
});

test("newsletter: the stored token is a hash; the emailed token confirms; signed unsubscribe links work only for their address", async () => {
  const { q } = await import("../src/lib/db");
  const { subscribe, confirmSubscription, unsubscribeNewsletter, newsletterUnsubToken } = await import("../src/lib/newsletter");
  const { hashToken } = await import("../src/lib/token-hash");

  await subscribe("fan@x.io", false, "test");
  const row = await q.get<{ id: number; token: string; token_hash: string }>("SELECT id, token, token_hash FROM newsletter_subscribers WHERE email = 'fan@x.io'");
  assert.match(row!.token_hash, /^[0-9a-f]{64}$/);
  assert.equal(row!.token, row!.token_hash, "the plain token isn't stored");
  const mail = await q.get<{ body: string }>("SELECT body FROM outbox WHERE to_email = 'fan@x.io'");
  assert.ok(mail && !/newsletter\/confirm\/[\w-]{20,}/.test(mail.body), "the Email log's copy hides the confirm link");
  assert.equal(await confirmSubscription(row!.token_hash), false, "the stored hash doesn't confirm");

  // A sign-up whose token we know: what subscribe stores for a token it emails.
  await q.run("INSERT INTO newsletter_subscribers (email, token, token_hash, created_at) VALUES ('known@x.io', ?, ?, ?)", hashToken("tok-known-123456"), hashToken("tok-known-123456"), Date.now());
  assert.equal(await confirmSubscription("tok-known-123456"), true, "the emailed token confirms");

  const known = (await q.get<{ id: number }>("SELECT id FROM newsletter_subscribers WHERE email = 'known@x.io'"))!;
  const link = newsletterUnsubToken({ id: known.id, email: "known@x.io" });
  assert.ok(link.length <= 64, "fits the unsubscribe page's 64-character cut");
  assert.equal(await unsubscribeNewsletter(newsletterUnsubToken({ id: row!.id, email: "known@x.io" })), false, "a signature for another address doesn't work");
  assert.equal(await unsubscribeNewsletter(`${link.slice(0, -1)}${link.endsWith("A") ? "B" : "A"}`), false, "a changed signature doesn't");
  assert.equal(await unsubscribeNewsletter(link), true);
  assert.ok((await q.get<{ unsubscribed_at: number | null }>("SELECT unsubscribed_at FROM newsletter_subscribers WHERE id = ?", known.id))!.unsubscribed_at);

  // Emails sent before 0140 carry the subscriber's plain token; 0140 filled its hash.
  await q.run("INSERT INTO newsletter_subscribers (email, token, token_hash, created_at, confirmed_at) VALUES ('old@x.io', 'tok-old-abcdef', ?, ?, ?)", hashToken("tok-old-abcdef"), Date.now(), Date.now());
  assert.equal(await unsubscribeNewsletter("tok-old-abcdef"), true, "an old email's unsubscribe link still works");
});
