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
