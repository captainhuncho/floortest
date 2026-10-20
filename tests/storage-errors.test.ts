import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// A fake S3 endpoint: "missing" keys answer 404, "locked" keys 403 (wrong credentials or bucket), everything else 200.
const server = http.createServer((req, res) => {
  const status = req.url?.includes("missing") ? 404 : req.url?.includes("locked") ? 403 : 200;
  res.writeHead(status, status === 200 ? { "Content-Length": "0" } : {});
  res.end();
});

test("storage: only a missing file reads as missing; a refused or unreachable bucket is an error", async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  process.env.STORAGE_DRIVER = "s3";
  process.env.S3_BUCKET = "test-bucket";
  process.env.S3_REGION = "auto";
  process.env.S3_ENDPOINT = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.S3_FORCE_PATH_STYLE = "true";
  process.env.S3_ACCESS_KEY_ID = "test";
  process.env.S3_SECRET_ACCESS_KEY = "test";
  try {
    const { storage } = await import("../src/lib/storage");
    const store = await storage();
    assert.equal(await store.head("audio/missing.wav"), null, "404: not there");
    await assert.rejects(store.head("audio/locked.wav"), /Storage error/, "403: an error, never 'missing'");
    server.close();
    server.closeAllConnections();
    await assert.rejects(store.head("audio/any.wav"), /Storage error/, "nothing listening: an error");
  } finally {
    server.close();
  }
});
