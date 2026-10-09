import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFlow, identityFromClaims, readIdentity, readPendingLink, signIdentity, signPendingLink, startFlow } from "../src/lib/google-auth";

const SECRET = "x".repeat(40);
const stateOf = (url: string) => new URL(url).searchParams.get("state");

test("a flow cookie works for its own state, carries who is linking, and asks Google for PKCE S256", () => {
  const f = startFlow("cid", "https://floortest.app/api/auth/google/callback", SECRET, 1000, 7);
  const u = new URL(f.url);
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("scope"), "openid email profile");
  assert.equal(checkFlow(f.cookie, stateOf(f.url), SECRET, 2000)?.link, 7);
  assert.equal(checkFlow(startFlow("cid", "https://x/cb", SECRET, 1000).cookie, null, SECRET, 2000), null);
});

test("a flow is refused for another state, a forged or expired cookie, or another secret", () => {
  const f = startFlow("cid", "https://x/cb", SECRET, 1000);
  const other = startFlow("cid", "https://x/cb", SECRET, 1000);
  assert.equal(checkFlow(f.cookie, stateOf(other.url), SECRET, 2000), null);
  assert.equal(checkFlow(undefined, stateOf(f.url), SECRET, 2000), null);
  assert.equal(checkFlow(f.cookie, stateOf(f.url), SECRET, 1000 + 11 * 60_000), null);
  assert.equal(checkFlow(f.cookie, stateOf(f.url), "y".repeat(40), 2000), null);
  const [body, sig] = f.cookie.split(".");
  const tampered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), link: 1 })).toString("base64url");
  assert.equal(checkFlow(`${tampered}.${sig}`, stateOf(f.url), SECRET, 2000), null);
});

test("ID tokens must be for us, from Google, unexpired, verified, and Gmail or a Workspace domain", () => {
  const ok = { aud: "cid", iss: "https://accounts.google.com", exp: 2000, sub: "1234567890", email: "DJ@Gmail.com", email_verified: true, given_name: "D" };
  assert.deepEqual(identityFromClaims(ok, "cid", 1000), { email: "dj@gmail.com", sub: "1234567890", first: "D", last: "" });
  assert.equal(identityFromClaims({ ...ok, aud: "someone-else" }, "cid", 1000), "bad");
  assert.equal(identityFromClaims({ ...ok, iss: "https://evil.example" }, "cid", 1000), "bad");
  assert.equal(identityFromClaims({ ...ok, exp: 1 }, "cid", 1000_000), "bad");
  assert.equal(identityFromClaims({ ...ok, email_verified: false }, "cid", 1000), "bad");
  assert.equal(identityFromClaims({ ...ok, sub: "" }, "cid", 1000), "bad");
  // A Google account made on someone's own-domain address proves little: refused unless that domain is the Workspace.
  assert.equal(identityFromClaims({ ...ok, email: "a@label.com" }, "cid", 1000), "untrusted");
  assert.equal(identityFromClaims({ ...ok, email: "a@label.com", hd: "other.com" }, "cid", 1000), "untrusted");
  assert.equal((identityFromClaims({ ...ok, email: "a@label.com", hd: "label.com" }, "cid", 1000) as { email: string }).email, "a@label.com");
});

test("sign-up and link hand-offs hold only while genuine and fresh, and can't stand in for each other", () => {
  const id = { email: "dj@gmail.com", sub: "1234567890", first: "D", last: "J" };
  const c = signIdentity(id, SECRET, 1000);
  assert.equal(readIdentity(c, SECRET, 2000)?.sub, "1234567890");
  assert.equal(readIdentity(c, SECRET, 1000 + 31 * 60_000), null);
  assert.equal(readIdentity(c, "y".repeat(40), 2000), null);
  const sig = c.split(".")[1];
  const swapped = Buffer.from(JSON.stringify({ ...id, email: "victim@gmail.com", exp: 9e15 })).toString("base64url");
  assert.equal(readIdentity(`${swapped}.${sig}`, SECRET, 2000), null);
  const link = signPendingLink({ userId: 4, sub: "1234567890", email: "dj@gmail.com" }, SECRET, 1000);
  assert.equal(readPendingLink(link, SECRET, 2000)?.userId, 4);
  assert.equal(readPendingLink(c, SECRET, 2000), null);
  assert.equal(readIdentity(link, SECRET, 2000), null);
});
