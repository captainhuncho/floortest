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
  assert.match(code, /^FLOOR-[A-Z2-9]{20}$/, "20 random characters: 80 unknown bits stay behind the hash after the 4-character hint");
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

test("Resend swaps in a new code and revokes the old one; two at once leave one live code; Undo puts the old one back", async () => {
  const { q } = await import("../src/lib/db");
  const { addPersonalInvite, swapPersonalInvite, liveInviteCode, personalInviteGone } = await import("../src/lib/invites");
  const { revertItem } = await import("../src/lib/ops-undo");
  const old = await addPersonalInvite("resend@x.io", "");
  const fresh = await swapPersonalInvite(old.id, "resend@x.io", "");
  assert.ok(fresh && fresh.code !== old.code);
  assert.equal(await liveInviteCode(fresh!.code), true, "the new code works");
  assert.equal(await liveInviteCode(old.code), false, "the old code doesn't");
  assert.equal(await personalInviteGone(old.code), true);

  const [a, b] = await Promise.all([swapPersonalInvite(fresh!.id, "resend@x.io", ""), swapPersonalInvite(fresh!.id, "resend@x.io", "")]);
  assert.equal([a, b].filter(Boolean).length, 1, "only one of two Resends at once makes a code");
  const live = await q.count("SELECT COUNT(*) AS n FROM invites WHERE email = 'resend@x.io' AND revoked_at IS NULL");
  assert.equal(live, 1, "one live invite for the email");

  const newest = (a ?? b)!;
  await revertItem(q, { kind: "invite_resend" } as never, { code: newest.id, prev: fresh!.id } as never);
  assert.equal(await liveInviteCode(fresh!.code), true, "Undo brings the previous code back");
  assert.equal(await liveInviteCode(newest.code), false, "and the unsent new one stops working");
});

test("the no-hash fallback never matches a used, revoked or expired invite", async () => {
  const { q } = await import("../src/lib/db");
  const { resolveInvite, liveInviteCode } = await import("../src/lib/invites");
  const t = Date.now();
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at, used_at) VALUES ('FLOOR-NHUSED234567', 1, '', 'nh1@x.io', ?, ?)", t, t);
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at, revoked_at) VALUES ('FLOOR-NHREVK234567', 1, '', 'nh2@x.io', ?, ?)", t, t);
  await q.run("INSERT INTO invites (code, max_uses, note, email, created_at, expires_at) VALUES ('FLOOR-NHEXPD234567', 1, '', 'nh3@x.io', ?, ?)", t, t - 1);
  for (const [code, email] of [["FLOOR-NHUSED234567", "nh1@x.io"], ["FLOOR-NHREVK234567", "nh2@x.io"], ["FLOOR-NHEXPD234567", "nh3@x.io"]]) {
    assert.equal((await resolveInvite(code, email, false)).valid, false, code);
    assert.equal(await liveInviteCode(code), false, code);
  }
});

test("malformed, empty and unknown-id unsubscribe links do nothing", async () => {
  const { unsubscribeNewsletter } = await import("../src/lib/newsletter");
  for (const bad of ["", "n", "n1.", "n1.short", `n999999.${"A".repeat(22)}`, `n0.${"A".repeat(22)}`, `n1.${"A".repeat(23)}`, "' OR 1=1 --"])
    assert.equal(await unsubscribeNewsletter(bad), false, JSON.stringify(bad));
});

test("a new shared code goes back in the action's answer, never through a cookie", async () => {
  const fs = await import("node:fs");
  // Server actions need an ops session, so this checks the code path.
  const src = fs.readFileSync(new URL("../src/app/admin/actions.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function createInvite")).split("\nexport ")[0];
  assert.doesNotMatch(body, /\b(done|fail|flash|cookies)\(/, "no flash cookie carries the code");
  assert.match(body, /return \{ ok: true, message: .*, code \};/, "the code is in the result");
  assert.match(body, /newInviteCode\(\)/, "a random shared code has the full 16 characters");
  const form = fs.readFileSync(new URL("../src/app/admin/invites/SharedCodeForm.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(form, /cookie|localStorage|sessionStorage/, "the page keeps it in memory only");
});

test("Undo of the first of two quick Resends brings nothing back: one live invite stays", async () => {
  const { q } = await import("../src/lib/db");
  const { addPersonalInvite, swapPersonalInvite, liveInviteCode } = await import("../src/lib/invites");
  const { revertItem } = await import("../src/lib/ops-undo");
  const a = await addPersonalInvite("twice@x.io", "");
  const b = (await swapPersonalInvite(a.id, "twice@x.io", ""))!; // Resend A → B
  const c = (await swapPersonalInvite(b.id, "twice@x.io", ""))!; // Resend B → C, inside the first one's hold
  await revertItem(q, { kind: "invite_resend" } as never, { code: b.id, prev: a.id } as never); // Undo the first
  assert.equal(await liveInviteCode(a.code), false, "A stays revoked");
  assert.equal(await liveInviteCode(c.code), true, "C still works");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM invites WHERE email = 'twice@x.io' AND revoked_at IS NULL"), 1);
});

test("a typed shared code keeps no hint; only random codes keep their last 4", async () => {
  const { inviteKeys, newInviteCode } = await import("../src/lib/invites");
  assert.equal(inviteKeys("DJCREW2026", { hint: false }).hint, "", "nothing of a typed code is stored in the clear");
  const code = newInviteCode();
  assert.equal(inviteKeys(code).hint, code.slice(-4));
  const fs = await import("node:fs");
  const src = fs.readFileSync(new URL("../src/app/admin/actions.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function createInvite")).split("\nexport ")[0];
  assert.match(body, /TYPED_CODE_MIN_LENGTH/, "short typed codes are refused");
  assert.match(body, /inviteKeys\(code, \{ hint: !typed \}\)/);
});
