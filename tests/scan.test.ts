import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
// @ts-expect-error -- plain JS module shipped with the scanner container
import { scanStream } from "../scanner/clamd.mjs";
import { scanConfigProblem, scannerHealth, scanStored, wakeScanner } from "../src/lib/scan";

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
    assert.equal((await scanStored("audio/1/down.wav", { deadlineMs: 300, backoffMs: [50] })).verdict, "unavailable", "a scanner that stays down is waited for until the deadline, then refused");
    assert.ok(seen.every((h) => h === `Bearer ${"s".repeat(40)}`));
  } finally {
    server.close();
    server.closeAllConnections();
  }
  // Nothing listening at all: unavailable, never "clean".
  process.env.SCAN_URL = "http://127.0.0.1:9";
  assert.equal((await scanStored("audio/1/ok.wav", { deadlineMs: 300, backoffMs: [50] })).verdict, "unavailable");
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

/** A fake scanner Worker that is asleep at first: it answers 503 "starting" (or refuses) until it has woken. */
async function sleepyScanner(opts: { wakeAfter: number; refuse?: boolean; hang?: boolean }) {
  const seen: string[] = [];
  let asks = 0;
  const server = http.createServer((req, res) => {
    seen.push(`${req.method} ${req.url} ${req.headers.authorization ?? ""}`);
    if (req.url === "/status") return res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ worker: true, container: "stopped" }));
    if (req.url === "/wake") return res.writeHead(202).end("{}");
    if (opts.hang) return; // never answers: a scan that never finishes
    if (++asks <= opts.wakeAfter) {
      if (opts.refuse) return req.socket.destroy();
      return res.writeHead(503, { "Content-Type": "application/json", "Retry-After": "10" }).end(JSON.stringify({ error: "Scanner starting" }));
    }
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ clean: true }));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  process.env.SCAN_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SCAN_SECRET = "s".repeat(40);
  return {
    seen,
    asks: () => asks,
    close: () => {
      server.close();
      server.closeAllConnections();
      delete process.env.SCAN_URL;
    },
  };
}

test("cold start: a sleeping scanner answers 'starting' a few times, the check waits and then gets the verdict", async () => {
  const fake = await sleepyScanner({ wakeAfter: 3 });
  try {
    const t0 = Date.now();
    assert.deepEqual(await scanStored("audio/1/ok.wav", { deadlineMs: 5_000, backoffMs: [50, 100] }), { verdict: "clean" });
    assert.equal(fake.asks(), 4, "three 'starting' answers, then the scan");
    assert.ok(Date.now() - t0 >= 50 + 100 + 100, "it paused between asks with growing waits");
  } finally {
    fake.close();
  }
  const refusing = await sleepyScanner({ wakeAfter: 2, refuse: true });
  try {
    assert.deepEqual(await scanStored("audio/1/ok.wav", { deadlineMs: 5_000, backoffMs: [50] }), { verdict: "clean" }, "refused connections while starting are waited out too");
  } finally {
    refusing.close();
  }
});

test("timeout: a scanner that never wakes, or a scan that never finishes, is 'unavailable' at the deadline, never clean", async () => {
  const asleep = await sleepyScanner({ wakeAfter: Infinity });
  try {
    const t0 = Date.now();
    const r = await scanStored("audio/1/ok.wav", { deadlineMs: 400, backoffMs: [50] });
    assert.equal(r.verdict, "unavailable");
    // The deadline lands between asks (gave up waiting) or, on a slow machine, during the last ask (TimeoutError).
    assert.match((r as { error: string }).error, /^(scanner answered 503; gave up waiting|TimeoutError$)/);
    assert.ok(Date.now() - t0 < 1_500, "it gives up at the deadline instead of asking for ever");
  } finally {
    asleep.close();
  }
  const hung = await sleepyScanner({ wakeAfter: 0, hang: true });
  try {
    const r = await scanStored("audio/1/ok.wav", { deadlineMs: 300, backoffMs: [50] });
    assert.deepEqual(r, { verdict: "unavailable", error: "TimeoutError" });
    assert.equal(hung.seen.filter((s) => s.startsWith("POST /scan")).length, 1, "a running scan is not cut short and sent again");
  } finally {
    hung.close();
  }
});

test("waking: the held-uploads batch asks the scanner to wake with the secret; health says 'asleep' without waking it", async () => {
  const fake = await sleepyScanner({ wakeAfter: 0 });
  try {
    await wakeScanner();
    assert.deepEqual(fake.seen, [`POST /wake Bearer ${"s".repeat(40)}`]);
    assert.equal(await scannerHealth(), "asleep");
    assert.ok(!fake.seen.some((s) => s.startsWith("GET /health")), "a sleeping scanner's health is read from /status, which doesn't wake it");
  } finally {
    fake.close();
  }
  // No scanner configured: nothing is sent, nothing throws.
  await wakeScanner();
  // A scanner that can't be reached: waking never throws (the check itself still waits and fails closed).
  process.env.SCAN_URL = "http://127.0.0.1:9";
  await wakeScanner();
  delete process.env.SCAN_URL;
});

test("a scan that failed on the file itself (502 'Scan failed' from the container) is answered at once, not waited on like a wake-up", async () => {
  let asks = 0;
  const server = http.createServer((req, res) => {
    req.resume();
    req.on("end", () => {
      asks++;
      res.writeHead(502, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Scan failed", reason: "NoSuchKey" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  process.env.SCAN_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  process.env.SCAN_SECRET = "s".repeat(40);
  try {
    const started = Date.now();
    const r = await scanStored("audio/1/gone.wav", { deadlineMs: 5_000, backoffMs: [200] });
    assert.deepEqual(r, { verdict: "unavailable", error: "scan failed: NoSuchKey", file: true });
    assert.equal(asks, 1, "asked once");
    assert.ok(Date.now() - started < 1_000, "no waiting for a wake-up");
  } finally {
    server.close();
    server.closeAllConnections();
    delete process.env.SCAN_URL;
  }
});
