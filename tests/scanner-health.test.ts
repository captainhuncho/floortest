import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// /api/health's detailed report asks the scanner's /health, which needs the secret since 28 Oct (scanner/cloudflare/routes.js).
// Without it, an awake scanner answered 401 and was reported as down.
const SECRET = "t".repeat(32);

test("the readiness check sends the scanner's secret to /health, so an awake scanner reads ok", async () => {
  const seen: string[] = [];
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url} ${req.headers.authorization ? "with secret" : "no secret"}`);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/status") return res.end(JSON.stringify({ worker: true, container: "healthy" }));
    if (req.url === "/health" && req.headers.authorization === `Bearer ${SECRET}`) return res.end(JSON.stringify({ clamd: true }));
    res.statusCode = 401;
    res.end(JSON.stringify({ error: "Unauthorized" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.SCAN_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SCAN_SECRET = SECRET;
  try {
    const { scannerHealth } = await import("../src/lib/scan");
    assert.equal(await scannerHealth(), "ok");
    assert.deepEqual(seen, ["GET /status no secret", "GET /health with secret"]);
  } finally {
    server.close();
  }
});
