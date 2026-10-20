import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
// @ts-expect-error -- plain JS module shipped with the scanner container
import { scanStream } from "../scanner/clamd.mjs";
import { scanConfigProblem, scannerHealth, scanStored } from "../src/lib/scan";

/** A fake clamd: reads the INSTREAM frames back into bytes, then answers like ClamAV would for those bytes. */
function fakeClamd(answer: (bytes: Buffer) => string) {
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    sock.on("data", (d: Buffer) => {
      buf = Buffer.concat([buf, d]);
      const head = "zINSTREAM\0".length;
      if (buf.length < head + 4) return;
      // Walk the frames; answer once the zero-length end frame has arrived.
      let i = head;
      const parts: Buffer[] = [];
      while (i + 4 <= buf.length) {
        const len = buf.readUInt32BE(i);
        if (len === 0) return sock.end(`stream: ${answer(Buffer.concat(parts))}\0`);
        if (i + 4 + len > buf.length) return;
        parts.push(buf.subarray(i + 4, i + 4 + len));
        i += 4 + len;
      }
    });
  });
  return new Promise<{ port: number; close: () => void }>((resolve) => server.listen(0, "127.0.0.1", () => resolve({ port: (server.address() as AddressInfo).port, close: () => server.close() })));
}

test("scanner protocol: a whole multi-chunk file reaches clamd; OK and FOUND are read correctly", async () => {
  const big = Buffer.alloc(2.5 * (1 << 20), 7); // crosses the 1 MiB chunking
  const eicar = Buffer.from("X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*");
  const clamd = await fakeClamd((bytes) => (bytes.includes("EICAR-STANDARD") ? "Eicar-Test-Signature FOUND" : bytes.length === big.length ? "OK" : `size ${bytes.length} ERROR`));
  try {
    assert.deepEqual(await scanStream([big], { port: clamd.port }), { clean: true });
    assert.deepEqual(await scanStream([eicar], { port: clamd.port }), { clean: false, signature: "Eicar-Test-Signature" });
  } finally {
    clamd.close();
  }
  const broken = await fakeClamd(() => "lstat() failed ERROR");
  try {
    await assert.rejects(scanStream([Buffer.from("x")], { port: broken.port }), /clamd:/);
  } finally {
    broken.close();
  }
});

test("app side: off without SCAN_URL; clean, infected and unavailable from the scanner; the secret is sent", async () => {
  delete process.env.SCAN_URL;
  assert.deepEqual(await scanStored("audio/1/a.wav"), { verdict: "off" });

  const seen: string[] = [];
  const server = http.createServer((req, res) => {
    seen.push(String(req.headers.authorization));
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const { key } = JSON.parse(body) as { key: string };
      res.writeHead(key.endsWith("down.wav") ? 502 : 200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(key.endsWith("bad.wav") ? { clean: false, signature: "Eicar-Test-Signature" } : key.endsWith("down.wav") ? { error: "Scan failed" } : { clean: true }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  process.env.SCAN_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SCAN_SECRET = "s".repeat(40);
  try {
    assert.deepEqual(await scanStored("audio/1/ok.wav"), { verdict: "clean" });
    assert.deepEqual(await scanStored("audio/1/bad.wav"), { verdict: "infected", signature: "Eicar-Test-Signature" });
    assert.equal((await scanStored("audio/1/down.wav")).verdict, "unavailable");
    assert.ok(seen.every((h) => h === `Bearer ${"s".repeat(40)}`));
  } finally {
    server.close();
    server.closeAllConnections();
  }
  // Nothing listening at all: unavailable, never "clean".
  process.env.SCAN_URL = "http://127.0.0.1:9";
  assert.equal((await scanStored("audio/1/ok.wav")).verdict, "unavailable");
  delete process.env.SCAN_URL;
});

test("on the live site a missing scanner refuses uploads instead of letting them through unscanned", async () => {
  delete process.env.SCAN_URL;
  delete process.env.SCAN_SECRET;
  try {
    process.env.VERCEL_ENV = "preview";
    assert.deepEqual(await scanStored("audio/1/a.wav"), { verdict: "off" }, "a preview runs without a scanner");
    assert.equal(scanConfigProblem(), null);
    process.env.VERCEL_ENV = "production";
    assert.equal((await scanStored("audio/1/a.wav")).verdict, "unavailable", "the live site never accepts unscanned");
    assert.match(scanConfigProblem() ?? "", /SCAN_URL is not set/);
    assert.equal(await scannerHealth(), "off");
    process.env.SCAN_URL = "http://127.0.0.1:9";
    assert.equal((await scanStored("audio/1/a.wav")).verdict, "unavailable", "a URL without its secret is refused too");
    assert.match(scanConfigProblem() ?? "", /SCAN_SECRET is not set/);
  } finally {
    delete process.env.VERCEL_ENV;
    delete process.env.SCAN_URL;
  }
});

test("the scanner's health check: ok, down when it answers wrongly, down when nothing answers", async () => {
  let healthy = true;
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ clamd: healthy }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  process.env.SCAN_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    assert.equal(await scannerHealth(), "ok");
    healthy = false;
    assert.equal(await scannerHealth(), "down", "the container is up but ClamAV isn't");
  } finally {
    server.close();
    server.closeAllConnections();
  }
  process.env.SCAN_URL = "http://127.0.0.1:9";
  assert.equal(await scannerHealth(), "down");
  delete process.env.SCAN_URL;
});
