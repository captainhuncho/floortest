import { test } from "node:test";
import assert from "node:assert/strict";
import { cookieProves, emailBinding, MAX_SENDERS, proves, readProof, RECEIPT_REMEMBER_MS, withSender } from "../src/lib/receipt-proof-core";

// Receipt Option B (owner, 2 Nov; Safety's conditions): the receipt's details open only for its sender, proven by the
// account they sent from or a signed cookie bound to that sender and their current email.
const SECRET = "receipt-proof-test-secret-".padEnd(48, "x");
const ama = { id: 11, email: "ama@example.com" };
const kojo = { id: 12, email: "kojo@example.com" };
const receipt = (s: { id: number; email: string }, account: number | null = null) => ({ sender_id: s.id, sender_email: s.email, sender_account: account });

test("a cookie made for a sender opens that sender's receipts", () => {
  const c = withSender(SECRET, undefined, ama.id, ama.email);
  assert.equal(cookieProves(SECRET, c, ama), true);
  assert.equal(proves(SECRET, receipt(ama), { cookie: c, personId: null }), true);
});

test("another sender's cookie opens nothing", () => {
  const c = withSender(SECRET, undefined, kojo.id, kojo.email);
  assert.equal(proves(SECRET, receipt(ama), { cookie: c, personId: null }), false);
  // Same email on another receiver's sender row is a different sender id: not opened either.
  assert.equal(cookieProves(SECRET, withSender(SECRET, undefined, 99, ama.email), ama), false);
});

test("changing the sender's email ends the cookie", () => {
  const c = withSender(SECRET, undefined, ama.id, ama.email);
  assert.equal(cookieProves(SECRET, c, { id: ama.id, email: "ama.new@example.com" }), false);
  // Case and spacing don't count as a change.
  assert.equal(cookieProves(SECRET, c, { id: ama.id, email: " AMA@Example.com " }), true);
});

test("a forged, edited, unsigned or other-key cookie proves nothing", () => {
  const c = withSender(SECRET, undefined, ama.id, ama.email);
  const [body, sig] = c.split(".");
  const forged = Buffer.from(JSON.stringify([{ s: ama.id, e: emailBinding(SECRET, ama.email), x: Date.now() + 1e9 }])).toString("base64url");
  for (const bad of [undefined, "", body, `${forged}.${sig}`, `${body}.x${sig.slice(1)}`, withSender("another-secret".padEnd(48, "y"), undefined, ama.id, ama.email), "ama@example.com"])
    assert.equal(cookieProves(SECRET, bad, ama), false, String(bad));
  assert.deepEqual(readProof(SECRET, "%%%.%%%"), []);
});

test("the cookie never carries the email address", () => {
  const c = withSender(SECRET, undefined, ama.id, ama.email);
  assert.ok(!Buffer.from(c.split(".")[0], "base64url").toString("utf8").includes("ama"));
  assert.ok(!c.includes("ama"));
});

test("an entry lasts 30 days", () => {
  const at = Date.now();
  const c = withSender(SECRET, undefined, ama.id, ama.email, at);
  assert.equal(cookieProves(SECRET, c, ama, at + RECEIPT_REMEMBER_MS - 1000), true);
  assert.equal(cookieProves(SECRET, c, ama, at + RECEIPT_REMEMBER_MS + 1000), false);
});

test("one cookie keeps several senders, the newest MAX_SENDERS", () => {
  let c: string | undefined;
  for (let i = 1; i <= MAX_SENDERS + 3; i++) c = withSender(SECRET, c, i, `s${i}@x.io`);
  assert.equal(readProof(SECRET, c).length, MAX_SENDERS);
  assert.equal(cookieProves(SECRET, c, { id: 1, email: "s1@x.io" }), false);
  assert.equal(cookieProves(SECRET, c, { id: MAX_SENDERS + 3, email: `s${MAX_SENDERS + 3}@x.io` }), true);
  // Renewing a sender doesn't duplicate it.
  const again = withSender(SECRET, c, MAX_SENDERS + 3, `s${MAX_SENDERS + 3}@x.io`);
  assert.equal(readProof(SECRET, again).length, MAX_SENDERS);
});

test("the signed-in account the sender sent from proves it; another account doesn't", () => {
  assert.equal(proves(SECRET, receipt(ama, 7), { cookie: undefined, personId: 7 }), true);
  assert.equal(proves(SECRET, receipt(ama, 7), { cookie: undefined, personId: 8 }), false);
  assert.equal(proves(SECRET, receipt(ama, null), { cookie: undefined, personId: 7 }), false);
  assert.equal(proves(SECRET, receipt(ama, null), { cookie: undefined, personId: null }), false);
});
