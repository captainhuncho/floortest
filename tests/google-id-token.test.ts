import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { identityFromCode, resetGoogleKeys, verifyGoogleIdToken } from "../src/lib/google-auth";

// No network: every Google answer here comes from a stubbed fetch, signed with keys made for the test.
const b64 = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString("base64url");
const pair = () => crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const google = pair();
const stranger = pair();
const jwk = (k: crypto.KeyObject, kid: string) => ({ ...(k.export({ format: "jwk" }) as object), kid, alg: "RS256", use: "sig" });
const JWKS = { keys: [jwk(google.publicKey, "g1")] };
const AT = 1_000_000;
const claims = { aud: "cid", iss: "https://accounts.google.com", exp: AT / 1000 + 600, sub: "1234567890", email: "dj@gmail.com", email_verified: true };

function sign(header: object, payload: object, key = google.privateKey) {
  const body = `${b64(header)}.${b64(payload)}`;
  return `${body}.${b64(crypto.sign("RSA-SHA256", Buffer.from(body), key))}`;
}

function stubFetch(jwks: object = JWKS, cache = "public, max-age=3600") {
  const calls: string[] = [];
  const f = (async (url: string | URL) => {
    calls.push(String(url));
    return new Response(JSON.stringify(jwks), { headers: { "cache-control": cache, "content-type": "application/json" } });
  }) as typeof fetch;
  return { f, calls };
}

test("a Google-signed ID token is accepted and its claims still checked", async () => {
  resetGoogleKeys();
  const { f, calls } = stubFetch();
  const tok = sign({ alg: "RS256", kid: "g1", typ: "JWT" }, claims);
  assert.equal((await verifyGoogleIdToken(tok, "cid", { fetch: f, at: AT }) as { email: string }).email, "dj@gmail.com");
  assert.deepEqual(calls, ["https://www.googleapis.com/oauth2/v3/certs"], "keys come only from Google's fixed address");
  // Claims are still checked after the signature: someone else's audience is refused.
  assert.equal(await verifyGoogleIdToken(sign({ alg: "RS256", kid: "g1" }, { ...claims, aud: "other" }), "cid", { fetch: f, at: AT }), "bad");
  assert.equal(await verifyGoogleIdToken(sign({ alg: "RS256", kid: "g1" }, { ...claims, exp: 1 }), "cid", { fetch: f, at: AT }), "bad");
});

test("the keys are cached for Cache-Control max-age, then fetched again", async () => {
  resetGoogleKeys();
  const { f, calls } = stubFetch(JWKS, "public, max-age=100");
  const tok = sign({ alg: "RS256", kid: "g1" }, claims);
  await verifyGoogleIdToken(tok, "cid", { fetch: f, at: AT });
  await verifyGoogleIdToken(tok, "cid", { fetch: f, at: AT + 50_000 });
  assert.equal(calls.length, 1, "inside max-age: from the cache");
  await verifyGoogleIdToken(tok, "cid", { fetch: f, at: AT + 101_000 });
  assert.equal(calls.length, 2, "after max-age: fetched again");
});

test("a token signed by another key, or naming a key Google doesn't have, is refused", async () => {
  resetGoogleKeys();
  const { f } = stubFetch();
  assert.equal(await verifyGoogleIdToken(sign({ alg: "RS256", kid: "g1" }, claims, stranger.privateKey), "cid", { fetch: f, at: AT }), "bad", "wrong key");
  assert.equal(await verifyGoogleIdToken(sign({ alg: "RS256", kid: "nope" }, claims, stranger.privateKey), "cid", { fetch: f, at: AT }), "bad", "unknown kid");
  assert.equal(await verifyGoogleIdToken(sign({ alg: "RS256" }, claims), "cid", { fetch: f, at: AT }), "bad", "no kid");
});

test("a tampered payload is refused", async () => {
  resetGoogleKeys();
  const { f } = stubFetch();
  const [h, , s] = sign({ alg: "RS256", kid: "g1" }, claims).split(".");
  const forged = `${h}.${b64({ ...claims, email: "victim@gmail.com", sub: "9999999999" })}.${s}`;
  assert.equal(await verifyGoogleIdToken(forged, "cid", { fetch: f, at: AT }), "bad");
});

test("only RS256: 'none', HS256 (keyed with the public key) and others are refused", async () => {
  resetGoogleKeys();
  const { f } = stubFetch();
  const body = (alg: string) => `${b64({ alg, kid: "g1" })}.${b64(claims)}`;
  assert.equal(await verifyGoogleIdToken(`${body("none")}.`, "cid", { fetch: f, at: AT }), "bad", "alg none");
  const pem = google.publicKey.export({ type: "spki", format: "pem" });
  const hs = `${body("HS256")}.${b64(crypto.createHmac("sha256", pem).update(body("HS256")).digest())}`;
  assert.equal(await verifyGoogleIdToken(hs, "cid", { fetch: f, at: AT }), "bad", "HS256");
  const ps = `${body("PS256")}.${b64(crypto.sign("sha256", Buffer.from(body("PS256")), { key: google.privateKey, padding: crypto.constants.RSA_PKCS1_PSS_PADDING }))}`;
  assert.equal(await verifyGoogleIdToken(ps, "cid", { fetch: f, at: AT }), "bad", "PS256");
  assert.equal(await verifyGoogleIdToken("not-a-jwt", "cid", { fetch: f, at: AT }), "bad");
});

test("when Google's keys can't be fetched, sign-in is refused", async () => {
  resetGoogleKeys();
  const down = (async () => new Response("oops", { status: 503 })) as unknown as typeof fetch;
  assert.equal(await verifyGoogleIdToken(sign({ alg: "RS256", kid: "g1" }, claims), "cid", { fetch: down, at: AT }), "bad");
  const boom = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  assert.equal(await verifyGoogleIdToken(sign({ alg: "RS256", kid: "g1" }, claims), "cid", { fetch: boom, at: AT }), "bad");
});

test("the code exchange verifies the returned ID token's signature", async () => {
  resetGoogleKeys();
  const now = { ...claims, exp: Math.floor(Date.now() / 1000) + 600 };
  const answer = (id_token: string) =>
    (async (url: string | URL) =>
      String(url).startsWith("https://oauth2.googleapis.com/token")
        ? new Response(JSON.stringify({ id_token }))
        : new Response(JSON.stringify(JWKS), { headers: { "cache-control": "max-age=3600" } })) as typeof fetch;
  const real = globalThis.fetch;
  try {
    globalThis.fetch = answer(sign({ alg: "RS256", kid: "g1" }, now));
    assert.equal((await identityFromCode({ id: "cid", secret: "s" }, "code", "v", "https://x/cb") as { sub: string }).sub, "1234567890");
    globalThis.fetch = answer(`${b64({ alg: "none" })}.${b64(now)}.`);
    assert.equal(await identityFromCode({ id: "cid", secret: "s" }, "code", "v", "https://x/cb"), "bad", "an unsigned token is refused");
  } finally {
    globalThis.fetch = real;
  }
});
