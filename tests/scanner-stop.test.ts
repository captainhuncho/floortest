import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";

/**
 * The scanner container sleeps by Cloudflare sending SIGTERM. Node is PID 1 there, and Linux ignores SIGTERM to a PID 1
 * without a handler, so scanner/server.mjs must exit on it by itself (it kept the container awake ~22.5 h a day).
 * No clamd or freshclam here: stopping them must tolerate their absence.
 */
test("the scanner service exits 0 on SIGTERM, quickly, even without clamd running", async () => {
  const child = spawn(process.execPath, ["scanner/server.mjs"], {
    env: {
      PATH: process.env.PATH ?? "",
      NODE_ENV: "test",
      PORT: "0",
      SCAN_SECRET: "t".repeat(40),
      S3_ENDPOINT: "http://127.0.0.1:9",
      S3_BUCKET: "test",
      SCAN_ACCESS_KEY_ID: "test",
      SCAN_SECRET_ACCESS_KEY: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    let out = "";
    await new Promise<void>((resolve, reject) => {
      child.stdout.on("data", (d: Buffer) => {
        out += d;
        if (out.includes("listening")) resolve();
      });
      child.once("exit", (code) => reject(new Error(`scanner exited early with ${code}`)));
    });
    const started = Date.now();
    child.kill("SIGTERM");
    const [code, signal] = (await once(child, "exit")) as [number | null, NodeJS.Signals | null];
    assert.equal(signal, null, "it exited by itself, not killed by the signal");
    assert.equal(code, 0);
    assert.ok(Date.now() - started < 3000, "it stopped within 3 seconds");
  } finally {
    child.kill("SIGKILL"); // no-op once it has exited
  }
});
