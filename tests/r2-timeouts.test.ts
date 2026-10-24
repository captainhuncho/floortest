import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";

process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");

test("storage calls give up on a connection where nothing moves, and never cap a long transfer", async () => {
  const { R2_HTTP } = await import("../src/lib/storage");
  assert.ok(R2_HTTP.connectionTimeout > 0 && R2_HTTP.connectionTimeout <= 10_000, "a connection that can't be made fails fast");
  assert.ok(R2_HTTP.socketTimeout >= 30_000, "a short pause mid-stream doesn't kill a 250 MB transfer");
  assert.ok(!("requestTimeout" in R2_HTTP), "no cap on the whole request, so big streams and zips can finish");

  // The same settings shape against a server that accepts and then says nothing: the call must fail, not hang.
  // (A shorter idle time here keeps the test quick; production uses R2_HTTP as above.)
  const silent = net.createServer(() => {});
  await new Promise<void>((r) => silent.listen(0, "127.0.0.1", r));
  const port = (silent.address() as net.AddressInfo).port;
  const client = new S3Client({
    region: "auto",
    endpoint: `http://127.0.0.1:${port}`,
    forcePathStyle: true,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
    maxAttempts: 1,
    requestHandler: { ...R2_HTTP, socketTimeout: 300 },
  });
  const started = Date.now();
  await assert.rejects(client.send(new HeadObjectCommand({ Bucket: "b", Key: "k" })));
  assert.ok(Date.now() - started < 5_000, `gave up after ${Date.now() - started} ms`);
  client.destroy();
  silent.close();
});
