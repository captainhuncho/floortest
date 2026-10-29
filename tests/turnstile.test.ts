import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-turnstile-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.APP_URL = "https://floortest.app";
process.env.TURNSTILE_SITE_KEY = "site";
process.env.TURNSTILE_SECRET_KEY = "secret";
delete process.env.DATABASE_URL;
delete process.env.VERCEL_URL;
delete process.env.VERCEL_BRANCH_URL;

test("bot check: a token counts only for its own form, solved on this site", async () => {
  const { q } = await import("../src/lib/db");
  const { passedTurnstile } = await import("../src/lib/turnstile");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('bot_check', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", Date.now());

  let answer: Record<string, unknown> = {};
  const real = globalThis.fetch;
  globalThis.fetch = (async () => new Response(JSON.stringify(answer))) as typeof fetch;
  try {
    answer = { success: true, action: "contact", hostname: "floortest.app" };
    assert.equal(await passedTurnstile("tok", "1.1.1.1", "contact"), true);
    assert.equal(await passedTurnstile("tok", "1.1.1.1", "auth"), false, "solved for another form");
    answer = { success: true, action: "contact", hostname: "evil.example" };
    assert.equal(await passedTurnstile("tok", "1.1.1.1", "contact"), false, "solved on another site");
    answer = { success: true, action: "contact" };
    assert.equal(await passedTurnstile("tok", "1.1.1.1", "contact"), false, "no hostname");
    answer = { success: false, "error-codes": ["invalid-input-response"] };
    assert.equal(await passedTurnstile("tok", "1.1.1.1", "contact"), false);
    assert.equal(await passedTurnstile("", "1.1.1.1", "contact"), false, "no token");
  } finally {
    globalThis.fetch = real;
  }
});

test("bot check hostnames: the app's own addresses; localhost only off the live site", async () => {
  const { botHostnames, turnstileAnswerOk } = await import("../src/lib/turnstile");
  const hosts = botHostnames();
  assert.ok(hosts.has("floortest.app"));
  const env = process.env as Record<string, string | undefined>;
  const was = env.NODE_ENV;
  env.NODE_ENV = "production";
  try {
    assert.equal(botHostnames().has("localhost"), false);
    assert.equal(turnstileAnswerOk({ success: true, action: "auth", hostname: "localhost" }, "auth"), false);
    assert.equal(turnstileAnswerOk({ success: true, action: "auth", hostname: "floortest.app" }, "auth"), true);
  } finally {
    env.NODE_ENV = was;
  }
});

test("bot check: Cloudflare's test secrets work off the live site but are refused on the production deployment", async () => {
  const { q } = await import("../src/lib/db");
  const { passedTurnstile, turnstileAnswerOk } = await import("../src/lib/turnstile");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('bot_check', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", Date.now());
  const env = process.env as Record<string, string | undefined>;
  const was = { node: env.NODE_ENV, vercel: env.VERCEL_ENV, secret: env.TURNSTILE_SECRET_KEY };
  const real = globalThis.fetch;
  let calls = 0;
  // What Cloudflare answers for a test secret: success, a dummy hostname, no form name.
  globalThis.fetch = (async () => {
    calls++;
    return new Response(JSON.stringify({ success: true, hostname: "example.com" }));
  }) as typeof fetch;
  const incidents = async () => Number((await q.get<{ n: number }>("SELECT COUNT(*) AS n FROM incidents WHERE message LIKE 'Bot check misconfigured%'"))!.n);
  try {
    for (const secret of ["1x0000000000000000000000000000000AA", "2x0000000000000000000000000000000AA", "3x0000000000000000000000000000000AA"]) {
      env.TURNSTILE_SECRET_KEY = secret;
      // Local, test and preview deployments keep using them (the e2e suite does).
      env.NODE_ENV = "production";
      env.VERCEL_ENV = "preview";
      assert.equal(turnstileAnswerOk({ success: true, hostname: "example.com" }, "auth"), true, "preview accepts test keys");
      assert.equal(await passedTurnstile("tok", "1.1.1.1", "auth"), true, "preview passes with a test key");
      env.NODE_ENV = "test";
      env.VERCEL_ENV = "production";
      assert.equal(await passedTurnstile("tok", "1.1.1.1", "auth"), true, "not a production build: still fine");
      // The real production deployment: a misconfiguration, recorded, and no token passes because of it.
      env.NODE_ENV = "production";
      env.VERCEL_ENV = "production";
      const before = await incidents();
      calls = 0;
      assert.equal(turnstileAnswerOk({ success: true, hostname: "example.com" }, "auth"), false, `${secret.slice(0, 2)} answer not trusted on production`);
      assert.equal(await passedTurnstile("tok", "1.1.1.1", "auth"), false, `${secret.slice(0, 2)} refused on production`);
      assert.equal(calls, 0, "Cloudflare isn't asked with a test secret on production");
      assert.equal(await incidents(), before + 1, "recorded as a misconfiguration");
    }
  } finally {
    globalThis.fetch = real;
    env.NODE_ENV = was.node;
    env.VERCEL_ENV = was.vercel;
    env.TURNSTILE_SECRET_KEY = was.secret;
  }
});
