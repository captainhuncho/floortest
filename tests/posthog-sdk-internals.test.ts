import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// src/lib/posthog-client.ts switches off PostHog's retry queue through private names (stopRetries). They hold for
// posthog-js 1.453.0 only: the version is pinned exactly, and this test fails if an upgrade renames them.
const root = process.cwd();

test("posthog-js stays pinned to exactly 1.453.0", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string> };
  assert.equal(pkg.dependencies["posthog-js"], "1.453.0");
  const installed = JSON.parse(readFileSync(join(root, "node_modules/posthog-js/package.json"), "utf8")) as { version: string };
  assert.equal(installed.version, "1.453.0");
});

test("the bundled retry queue still has the private names stopRetries relies on", () => {
  const bundle = readFileSync(join(root, "node_modules/posthog-js/dist/module.full.no-external.js"), "utf8");
  for (const name of ["this._retryQueue=new", "this._queue.push({retryAt:", "_poller=setTimeout(", "this._onlineListener=()=>", "this._offlineListener=()=>", "retriableRequest(e,t){", "_enqueue(e,t){", "_flush(){"]) {
    assert.ok(bundle.includes(name), name);
  }
});
