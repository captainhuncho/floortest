import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkAudit, parseAudit, type Allowed, type AuditJson } from "../scripts/audit-check";

const ALLOWED: Allowed = { id: "GHSA-fc5q-39xc-vjpf", reason: "build-time only", expires: "2026-12-17" };
const advisory = (id: string, severity = "high") => ({ source: 1, title: id, url: `https://github.com/advisories/${id}`, severity });

// Today's shape: one advisory on picomatch, the packages above it only pointing at it by name.
const today: AuditJson = {
  vulnerabilities: {
    picomatch: { severity: "high", via: [advisory("GHSA-fc5q-39xc-vjpf")] },
    fdir: { severity: "high", via: ["picomatch"] },
    "@rollup/pluginutils": { severity: "high", via: ["picomatch"] },
    "@rollup/plugin-commonjs": { severity: "high", via: ["@rollup/pluginutils", "fdir", "picomatch"] },
    "@sentry/nextjs": { severity: "high", via: ["@rollup/plugin-commonjs"] },
  },
};

test("the allowed advisory and everything that only leads to it pass, with the reason", () => {
  const r = checkAudit(today, [ALLOWED], "2026-11-17");
  assert.deepEqual(r.failed, []);
  assert.equal(r.allowed.length, 5);
  assert.match(r.allowed.find((a) => a.name === "@sentry/nextjs")!.reasons[0], /GHSA-fc5q-39xc-vjpf until 2026-12-17: build-time only/);
});

test("another high advisory fails", () => {
  const r = checkAudit({ vulnerabilities: { next: { severity: "high", via: [advisory("GHSA-aaaa-bbbb-cccc")] } } }, [ALLOWED], "2026-11-17");
  assert.deepEqual(r.failed.map((f) => f.name), ["next"]);
});

test("an entry past its expiry no longer counts", () => {
  const r = checkAudit(today, [ALLOWED], "2026-12-18");
  assert.equal(r.failed.length, 5);
  assert.equal(r.allowed.length, 0);
  assert.equal(checkAudit(today, [ALLOWED], "2026-12-17").failed.length, 0, "still allowed on the expiry day itself");
});

test("a chain that also leads to a new advisory fails, even on the same package", () => {
  const mixed: AuditJson = {
    vulnerabilities: {
      ...today.vulnerabilities,
      picomatch: { severity: "high", via: [advisory("GHSA-fc5q-39xc-vjpf"), advisory("GHSA-new0-new0-new0", "critical")] },
    },
  };
  const r = checkAudit(mixed, [ALLOWED], "2026-11-17");
  assert.equal(r.allowed.length, 0);
  assert.deepEqual(r.failed.find((f) => f.name === "@sentry/nextjs")!.advisories.sort(), ["GHSA-fc5q-39xc-vjpf", "GHSA-new0-new0-new0"]);
});

test("moderate and low findings are left to npm, and an empty report passes", () => {
  assert.deepEqual(checkAudit({ vulnerabilities: { x: { severity: "moderate", via: [advisory("GHSA-mmmm-mmmm-mmmm", "moderate")] } } }, [], "2026-11-17"), { failed: [], allowed: [] });
  assert.deepEqual(checkAudit({}, [], "2026-11-17"), { failed: [], allowed: [] });
});

test("a report that can't be read fails instead of passing", () => {
  assert.throws(() => parseAudit(""), /no report/);
  assert.throws(() => parseAudit("npm ERR! network"), /no report/);
  assert.throws(() => parseAudit(JSON.stringify({ error: { code: "ENOTFOUND", summary: "registry unreachable" } })), /npm audit failed/);
  const real = { ...today, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 5, critical: 0, total: 5 } } };
  assert.deepEqual(parseAudit(JSON.stringify(real)), real);
});

test("a registry error, a missing findings list or totals that don't match fail (Safety, 17 Nov)", () => {
  // What npm prints with the registry unreachable: valid JSON, no vulnerabilities key.
  assert.throws(() => parseAudit(JSON.stringify({ message: "request to http://127.0.0.1:9/-/npm/v1/security/advisories/bulk failed, reason: connect ECONNREFUSED", error: { code: "ECONNREFUSED" } })), /npm audit failed/);
  assert.throws(() => parseAudit(JSON.stringify({ metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0, total: 0 } } })), /npm audit failed/, "no vulnerabilities key");
  assert.throws(() => parseAudit(JSON.stringify({ vulnerabilities: {} })), /npm audit failed/, "no metadata");
  assert.throws(() => parseAudit("{}"), /npm audit failed/, "empty object");
  assert.throws(() => parseAudit(JSON.stringify({ message: "Not Found", statusCode: 404 })), /npm audit failed/, "a proxy or registry 404");
  assert.throws(() => parseAudit(JSON.stringify({ vulnerabilities: {}, metadata: { vulnerabilities: { high: "0", critical: "0" } } })), /no high and critical totals/, "totals that aren't numbers");
  assert.throws(() => parseAudit(JSON.stringify({ vulnerabilities: {}, metadata: { vulnerabilities: {} } })), /no high and critical totals/, "totals missing");
  assert.throws(() => parseAudit(JSON.stringify({ ...today, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 6, critical: 0, total: 6 } } })), /doesn't add up/, "metadata says one more than listed");
  assert.throws(() => parseAudit(JSON.stringify({ ...today, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 5, critical: 1, total: 6 } } })), /doesn't add up/, "a critical not listed");
  assert.throws(() => parseAudit(JSON.stringify({ ...today, error: { code: "E500" }, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 5, critical: 0, total: 5 } } })), /npm audit failed/, "an error key fails even with findings");
});

test("the check itself exits non-zero when npm audit gives no report or an error", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "audit-check-"));
  const run = (npmOutput: string) => {
    fs.writeFileSync(path.join(dir, "npm"), `#!/bin/sh\nprintf '%s' '${npmOutput}'\nexit 1\n`, { mode: 0o755 });
    return spawnSync(process.execPath, ["--import", "tsx", "scripts/audit-check.ts"], { env: { ...process.env, PATH: `${dir}${path.delimiter}${process.env.PATH}` }, encoding: "utf8" });
  };
  try {
    for (const out of ["npm ERR! network", '{"message":"ECONNREFUSED","error":{"code":"ECONNREFUSED"}}', '{"vulnerabilities":{}}']) {
      const r = run(out);
      assert.equal(r.status, 1, `exit for ${out}: ${r.stderr}`);
      assert.match(r.stderr, /Failing rather than passing unchecked/);
    }
    const clean = run('{"vulnerabilities":{},"metadata":{"vulnerabilities":{"info":0,"low":0,"moderate":0,"high":0,"critical":0,"total":0}}}');
    assert.equal(clean.status, 0, `a clean report passes: ${clean.stderr}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
