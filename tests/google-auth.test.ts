import { test } from "node:test";
import assert from "node:assert/strict";
import { checkFlow, emailFromClaims, startFlow } from "../src/lib/google-auth";

const SECRET = "x".repeat(40);
const stateOf = (url: string) => new URL(url).searchParams.get("state");

test("a flow cookie works once for its own state, and asks Google for PKCE S256", () => {
  const f = startFlow("cid", "https://floortest.app/api/auth/google/callback", SECRET, 1000);
  const u = new URL(f.url);
  assert.equal(u.searchParams.get("code_challenge_method"), "S256");
  assert.equal(u.searchParams.get("scope"), "openid email profile");
  assert.ok(checkFlow(f.cookie, stateOf(f.url), SECRET, 2000));
});

test("a flow is refused for another state, a forged or expired cookie, or another secret", () => {
  const f = startFlow("cid", "https://x/cb", SECRET, 1000);
  const other = startFlow("cid", "https://x/cb", SECRET, 1000);
  assert.equal(checkFlow(f.cookie, stateOf(other.url), SECRET, 2000), null);
  assert.equal(checkFlow(f.cookie, null, SECRET, 2000), null);
  assert.equal(checkFlow(undefined, stateOf(f.url), SECRET, 2000), null);
  assert.equal(checkFlow(f.cookie, stateOf(f.url), SECRET, 1000 + 11 * 60_000), null);
  assert.equal(checkFlow(f.cookie, stateOf(f.url), "y".repeat(40), 2000), null);
  const [body, sig] = f.cookie.split(".");
  const tampered = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body, "base64url").toString()), exp: 9e15 })).toString("base64url");
  assert.equal(checkFlow(`${tampered}.${sig}`, stateOf(f.url), SECRET, 2000), null);
});

test("ID token claims must be for us, from Google, unexpired and with a verified email", () => {
  const ok = { aud: "cid", iss: "https://accounts.google.com", exp: 2000, email: "DJ@Example.com", email_verified: true };
  assert.equal(emailFromClaims(ok, "cid", 1000), "dj@example.com");
  assert.equal(emailFromClaims({ ...ok, aud: "someone-else" }, "cid", 1000), null);
  assert.equal(emailFromClaims({ ...ok, iss: "https://evil.example" }, "cid", 1000), null);
  assert.equal(emailFromClaims({ ...ok, exp: 1 }, "cid", 1000_000), null);
  assert.equal(emailFromClaims({ ...ok, email_verified: false }, "cid", 1000), null);
});
