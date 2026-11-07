import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load. fetch is stubbed: no network.
process.env.DATA_DIR = testDataDir("ft-turnstile-closed-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.APP_URL = "https://floortest.app";
process.env.TURNSTILE_SITE_KEY = "site";
process.env.TURNSTILE_SECRET_KEY = "secret";
delete process.env.DATABASE_URL;

test("bot check down: forms that email strangers refuse, sign-in still lets people through", async () => {
  const { q } = await import("../src/lib/db");
  const { passedTurnstile } = await import("../src/lib/turnstile");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('bot_check', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", Date.now());
  const real = globalThis.fetch;
  try {
    // Cloudflare unreachable.
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    for (const form of ["sent", "newsletter", "reopen", "contact", "send"] as const)
      assert.equal(await passedTurnstile("tok", "1.1.1.1", form), false, `${form} fails closed`);
    assert.equal(await passedTurnstile("tok", "1.1.1.1", "auth"), true, "sign-in stays open");
    // Cloudflare answers with its own internal error.
    globalThis.fetch = (async () => new Response(JSON.stringify({ success: false, "error-codes": ["internal-error"] }))) as typeof fetch;
    assert.equal(await passedTurnstile("tok", "1.1.1.1", "sent"), false);
    assert.equal(await passedTurnstile("tok", "1.1.1.1", "auth"), true);
  } finally {
    globalThis.fetch = real;
  }
});

test("bot check down: emailed codes and reset links for one address still stop at the hard limit", async () => {
  const { q } = await import("../src/lib/db");
  const { emailRequestBlocked, EMAIL_HARD } = await import("../src/lib/email-request-limits");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('bot_check', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", Date.now());
  const real = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const form = new FormData();
    form.set("cf-turnstile-response", "tok");
    let sent = 0;
    for (let i = 0; i < EMAIL_HARD + 5; i++) if (!(await emailRequestBlocked("reset", "outage@audit.io", `10.3.0.${i}`, form))) sent++;
    assert.equal(sent, EMAIL_HARD, "the check let them through unchecked, so the hard stop applies");
  } finally {
    globalThis.fetch = real;
  }
});

test("every check solved: one address still stops at the ceiling", async () => {
  const { q } = await import("../src/lib/db");
  const { emailRequestBlocked, EMAIL_CEILING } = await import("../src/lib/email-request-limits");
  await q.run("INSERT INTO switches (key, on_, updated_at) VALUES ('bot_check', 1, ?) ON CONFLICT (key) DO UPDATE SET on_ = 1", Date.now());
  const real = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response(JSON.stringify({ success: true, action: "auth", hostname: "floortest.app" }))) as typeof fetch;
    const form = new FormData();
    form.set("cf-turnstile-response", "tok");
    let sent = 0;
    for (let i = 0; i < EMAIL_CEILING + 5; i++) if (!(await emailRequestBlocked("login_code", "solver@audit.io", `10.4.0.${i}`, form))) sent++;
    assert.equal(sent, EMAIL_CEILING);
  } finally {
    globalThis.fetch = real;
  }
});
