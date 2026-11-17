import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// The scanner must go to sleep when idle (17 Nov: it ignored Cloudflare's stop signal and ran about 94% of the time,
// billed for 3 GiB all day). Two guards: the scan service exits on SIGTERM, and the Worker forces the container off if it
// is still running 10 minutes after the polite stop.

test("the scan service exits cleanly on SIGTERM (as PID 1 it would otherwise ignore the stop)", async () => {
  const child = spawn(process.execPath, ["scanner/server.mjs"], {
    env: {
      NODE_ENV: "test",
      PATH: process.env.PATH,
      SCAN_SECRET: "s".repeat(32),
      S3_ENDPOINT: "https://storage.example",
      S3_BUCKET: "test-bucket",
      SCAN_ACCESS_KEY_ID: "test-key",
      SCAN_SECRET_ACCESS_KEY: "test-secret",
      PORT: "0",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  await new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`scanner didn't start: ${out}`)), 15_000);
    child.stdout.on("data", () => /listening/.test(out) && (clearTimeout(t), resolve()));
  });
  const exited = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => child.on("exit", (code, signal) => resolve({ code, signal })));
  child.kill("SIGTERM");
  const timeout = new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), 10_000).unref());
  const result = await Promise.race([exited, timeout]);
  if (result === "timeout") child.kill("SIGKILL");
  // Exit code 0, not "killed by SIGTERM": the handler ran. Without it the child dies by the signal (code null) here, and
  // as PID 1 in the container it wouldn't stop at all.
  assert.deepEqual(result, { code: 0, signal: null }, out);
  assert.match(out, /scanner stopping \(SIGTERM\)/);
});

/** The Worker's Scanner class with a stand-in for @cloudflare/containers, so its stop logic runs without Cloudflare. */
async function loadScanner() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ft-scanner-worker-"));
  fs.writeFileSync(
    path.join(dir, "containers.mjs"),
    `export class Container {
      calls = [];
      container = { running: true };
      async stop() { this.calls.push("stop"); }
      async destroy() { this.calls.push("destroy"); this.container.running = false; }
    }
    export const getContainer = () => null;`,
  );
  const routes = pathToFileURL(path.resolve("scanner/cloudflare/routes.js")).href;
  const src = fs
    .readFileSync("scanner/cloudflare/index.js", "utf8")
    .replace('from "@cloudflare/containers"', `from "./containers.mjs"`)
    .replace('from "./routes.js"', `from ${JSON.stringify(routes)}`);
  const file = path.join(dir, "index.mjs");
  fs.writeFileSync(file, src);
  const mod = await import(pathToFileURL(file).href);
  return mod.Scanner as new (ctx: unknown, env: unknown) => {
    calls: string[];
    container: { running: boolean };
    onStart(): void;
    onActivityExpired(): Promise<void>;
  };
}

test("idle: a polite stop first, forced off if still running at the next check, and a fresh run starts polite again", async () => {
  const Scanner = await loadScanner();
  const s = new Scanner({}, {});
  await s.onActivityExpired();
  assert.deepEqual(s.calls, ["stop"], "first idle check sends SIGTERM only");
  await s.onActivityExpired();
  assert.deepEqual(s.calls, ["stop", "destroy"], "still running 10 minutes later: forced off");
  await s.onActivityExpired();
  assert.deepEqual(s.calls, ["stop", "destroy"], "nothing to do once it's off");

  s.container.running = true;
  s.onStart();
  await s.onActivityExpired();
  assert.deepEqual(s.calls, ["stop", "destroy", "stop"], "a new run gets the polite stop again");
});
