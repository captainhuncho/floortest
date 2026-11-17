import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAudit, type Allowed, type AuditJson } from "../scripts/audit-check";

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
