import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Rule 3 (audit 27 Oct): the server never fetches an address a visitor chose (SSRF). A throwaway local database for the
// tunnel's rate limit.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-fetch-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

const OURS = "https://publickey@o42.ingest.de.sentry.io/4501";
const envelope = (dsn: string) => `${JSON.stringify({ dsn, sent_at: "2026-10-27T00:00:00Z" })}\n{"type":"event"}\n{}`;

test("the Sentry tunnel forwards only our own project's reports, and only to Sentry's ingest host", async () => {
  process.env.NEXT_PUBLIC_SENTRY_DSN = OURS;
  const { POST } = await import("../src/app/api/monitoring/route");
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL) => {
    calls.push(String(url));
    return new Response(null, { status: 200 });
  }) as typeof fetch;
  try {
    const send = async (body: string, ip: string) =>
      (await POST(new Request("https://floortest.app/api/monitoring", { method: "POST", body, headers: { "x-forwarded-for": ip } }))).status;
    assert.equal(await send(envelope("https://publickey@evil.example/4501"), "10.0.0.1"), 400, "another host");
    assert.equal(await send(envelope("https://publickey@o42.ingest.de.sentry.io/9999"), "10.0.0.2"), 400, "another project on Sentry");
    assert.equal(await send(envelope("https://publickey@169.254.169.254/4501"), "10.0.0.3"), 400, "a cloud metadata address");
    assert.equal(await send("not json\n{}", "10.0.0.4"), 400, "no envelope header");
    assert.deepEqual(calls, [], "nothing was fetched for any of those");
    assert.equal(await send(envelope(OURS), "10.0.0.5"), 200);
    assert.deepEqual(calls, ["https://o42.ingest.de.sentry.io/api/4501/envelope/"], "ours goes to our DSN's host, never to the address in the report");
  } finally {
    globalThis.fetch = real;
  }
});

/**
 * Every fetch() in the server code, and where its address comes from. A new fetch whose address isn't a fixed https
 * address or one of these fails here until someone checks it can't be pointed elsewhere by a request.
 */
const KNOWN: Record<string, string[]> = {
  "src/app/api/monitoring/route.ts": ["`https://${ours.host}/api/${project}/envelope/`"], // our DSN's host (test above)
  "src/lib/incidents.ts": ["hook"], // ALERT_WEBHOOK_URL, the environment
  // SCAN_URL, the environment, via scanBase() (/scan, /wake, /status in scannerHealth and scannerAwake, /health)
  "src/lib/scan.ts": ["`${url}/scan`", "`${url}/wake`", "`${url}/status`", "`${url}/status`", "`${url}/health`"],
  "src/lib/google-auth.ts": ["TOKEN_URL"], // Google's fixed token address
};

function files(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

test("no server-side fetch takes an address from a request", () => {
  const root = path.join(import.meta.dirname, "..");
  const found: Record<string, string[]> = {};
  for (const file of files(path.join(root, "src"))) {
    const src = fs.readFileSync(file, "utf8");
    // Code that runs in the browser can only reach what the browser can; the server is what matters here.
    if (/^\s*["']use client["']/.test(src)) continue;
    for (const m of src.matchAll(/\bfetch\(\s*([^,)]+)/g)) {
      const arg = m[1].trim();
      if (/^"https:\/\/[^"$]+"$/.test(arg) || /^["'`]\//.test(arg)) continue; // a fixed https address, or our own path
      (found[path.relative(root, file)] ??= []).push(arg);
    }
  }
  assert.deepEqual(found, KNOWN);
});
