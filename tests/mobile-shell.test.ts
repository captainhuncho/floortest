import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { appSite } from "../mobile/scripts/site";
import { clearAllShared } from "../src/lib/native-share";

// Audit 29 Oct (H12, H48, H70): the phone app only lets its own site in, and a release build can't point anywhere else.
const MOBILE = path.join(__dirname, "..", "mobile");

/** Loads mobile/capacitor.config.ts the way the Capacitor CLI does (Node's own TypeScript loader), with this environment. */
function loadConfig(env: Record<string, string>) {
  const run = spawnSync(process.execPath, ["--input-type=module", "-e", "const c = (await import('./capacitor.config.ts')).default; console.log(JSON.stringify(c));"], {
    cwd: MOBILE,
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", ...env },
    encoding: "utf8",
  });
  return { ok: run.status === 0, config: run.status === 0 ? JSON.parse(run.stdout.trim().split("\n").pop() ?? "{}") : null, err: run.stderr };
}

test("a release build opens floortest.app and lets only floortest.app in", () => {
  const { ok, config, err } = loadConfig({});
  assert.ok(ok, err);
  assert.equal(config.server.url, "https://floortest.app/dashboard/floor");
  assert.deepEqual(config.server.allowNavigation, ["floortest.app"]);
  assert.equal(config.server.cleartext, false);
});

test("a release build refuses any other address", () => {
  for (const url of ["http://floortest.app", "https://ops.floortest.app", "https://floortest.app.evil.example", "https://evil.example", "http://localhost:3000", "https://user@floortest.app", "not a url"]) {
    assert.throws(() => appSite({ FLOORTEST_URL: url }), Error, url);
    assert.equal(loadConfig({ FLOORTEST_URL: url }).ok, false, `config: ${url}`);
  }
});

test("a dev build may use a local copy, and only then is localhost let in", () => {
  const local = appSite({ FLOORTEST_URL: "http://localhost:3000/", FLOORTEST_DEV: "1" });
  assert.equal(local.site, "http://localhost:3000");
  assert.ok(local.hosts.includes("localhost"));
  const lan = appSite({ FLOORTEST_URL: "http://192.168.1.20:3000", FLOORTEST_DEV: "1" });
  assert.ok(!lan.hosts.includes("localhost"));
  assert.ok(lan.hosts.includes("192.168.1.20"));
  const { config } = loadConfig({ FLOORTEST_URL: "http://localhost:3000", FLOORTEST_DEV: "1" });
  assert.equal(config.server.cleartext, true);
  assert.ok(config.server.allowNavigation.includes("localhost"));
  for (const hosts of [local.hosts, lan.hosts, appSite({}).hosts]) assert.ok(hosts.every((h) => !h.includes("*")), "never a wildcard");
});

test("signing out empties the share inbox, so a shared file can't wait for the next account", async () => {
  const waiting = new Set(["a", "b"]);
  const ShareInbox = {
    list: async () => ({ files: [...waiting].map((id) => ({ id, name: `${id}.wav`, size: 1 })) }),
    read: async () => ({ data: "" }),
    remove: async ({ id }: { id: string }) => void waiting.delete(id),
  };
  const g = globalThis as unknown as { window?: unknown };
  g.window = { Capacitor: { isNativePlatform: () => true, Plugins: { ShareInbox } } };
  try {
    await clearAllShared();
    assert.equal(waiting.size, 0);
    // On the website there's no inbox: nothing happens, nothing throws.
    g.window = {};
    await clearAllShared();
  } finally {
    delete g.window;
  }
});
