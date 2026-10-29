import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

// A fake S3 endpoint that records each server-side copy (a PUT with x-amz-copy-source) and answers it.
const copies: http.IncomingHttpHeaders[] = [];
const server = http.createServer((req, res) => {
  req.resume();
  req.on("end", () => {
    if (req.method === "PUT" && req.headers["x-amz-copy-source"]) copies.push(req.headers);
    res.writeHead(200, { "Content-Type": "application/xml" });
    res.end(`<?xml version="1.0" encoding="UTF-8"?><CopyObjectResult><ETag>"e"</ETag><LastModified>2026-10-29T00:00:00.000Z</LastModified></CopyObjectResult>`);
  });
});

test("sealing sets the stored Content-Type itself, from the file's extension, never keeping what the upload sent", async () => {
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  process.env.STORAGE_DRIVER = "s3";
  process.env.S3_BUCKET = "test-bucket";
  process.env.S3_REGION = "auto";
  process.env.S3_ENDPOINT = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.S3_FORCE_PATH_STYLE = "true";
  process.env.S3_ACCESS_KEY_ID = "test";
  process.env.S3_SECRET_ACCESS_KEY = "test";
  try {
    const { sealUpload, storage } = await import("../src/lib/storage");
    const store = await storage();
    const wav = await sealUpload(store, "audio/1/up.wav");
    const mp3 = await sealUpload(store, "stems/1/up.MP3");
    const odd = await sealUpload(store, "audio/1/up");
    assert.match(wav, /^audio\/1\/[0-9a-f-]{36}\.wav$/);
    assert.match(mp3, /^stems\/1\/[0-9a-f-]{36}\.mp3$/);
    assert.deepEqual(
      copies.map((h) => [h["x-amz-metadata-directive"], h["content-type"]]),
      [
        ["REPLACE", "audio/wav"],
        ["REPLACE", "audio/mpeg"],
        ["REPLACE", "application/octet-stream"],
      ],
    );
    assert.ok(odd);
  } finally {
    server.close();
    server.closeAllConnections();
  }
});
