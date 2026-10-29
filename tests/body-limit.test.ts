import { test } from "node:test";
import assert from "node:assert/strict";

process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");

// Hardening H15 (29 Oct): the Resend webhook and the Sentry tunnel stop reading a body once it is too big,
// instead of holding all of it in memory first.
const stream = (chunks: number, size: number) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (let i = 0; i < chunks; i++) c.enqueue(new Uint8Array(size).fill(97));
      c.close();
    },
  });

test("a body over the limit is refused, whether or not it says its size", async () => {
  const { readLimited } = await import("../src/lib/body-limit");
  const big = new Request("http://localhost/x", { method: "POST", body: stream(20, 1000), duplex: "half" } as RequestInit);
  assert.equal(await readLimited(big, 5000), null, "streamed without a Content-Length");
  const says = new Request("http://localhost/x", { method: "POST", body: "a", headers: { "content-length": "999999999" } });
  assert.equal(await readLimited(says, 5000), null, "a Content-Length over the limit is refused before reading");
  const ok = new Request("http://localhost/x", { method: "POST", body: stream(2, 1000), duplex: "half" } as RequestInit);
  assert.equal((await readLimited(ok, 5000))?.length, 2000);
});

test("the Resend webhook answers 413 to an oversized report before checking its signature", async () => {
  process.env.RESEND_WEBHOOK_SECRET = "whsec_" + Buffer.from("k".repeat(32)).toString("base64");
  const { POST } = await import("../src/app/api/webhooks/resend/route");
  const res = await POST(new Request("http://localhost/api/webhooks/resend", { method: "POST", body: stream(300, 1000), duplex: "half" } as RequestInit));
  assert.equal(res.status, 413);
});

test("the Sentry tunnel answers 413 to an oversized envelope", async () => {
  process.env.NEXT_PUBLIC_SENTRY_DSN = "https://abc@o1.ingest.sentry.io/123";
  process.env.DATA_DIR ??= (await import("node:fs")).mkdtempSync((await import("node:path")).join((await import("node:os")).tmpdir(), "ft-body-limit-"));
  delete process.env.DATABASE_URL;
  const { POST } = await import("../src/app/api/monitoring/route");
  const res = await POST(new Request("http://localhost/api/monitoring", { method: "POST", headers: { "x-real-ip": "7.7.7.7" }, body: stream(1100, 1000), duplex: "half" } as RequestInit));
  assert.equal(res.status, 413);
});
