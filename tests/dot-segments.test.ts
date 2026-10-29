import { test } from "node:test";
import assert from "node:assert/strict";
import { localPath as gateBack } from "../src/lib/next-path";
import { localPath as linkPath } from "../src/lib/safe-links";

// Hardening H21 (29 Oct): a path whose dot segments collapse to "//host" is refused, not just left harmless.
const tricks = ["/..//evil.com", "/%2e%2e//evil.com", "/%2E%2E//evil.com", "/.//evil.com", "/a/..//evil.com", "/%2e//evil.com", "/x/%2e%2e//evil.com/p"];

test("the coming-soon gate refuses paths that normalise to another host", () => {
  for (const p of tricks) assert.equal(gateBack(p), "/", p);
  assert.equal(gateBack("/pricing"), "/pricing");
  assert.equal(gateBack("/a/../pricing"), "/a/../pricing", "dot segments that stay on a single slash are fine");
});

test("announcement links refuse paths that normalise to another host", () => {
  for (const p of tricks) assert.equal(linkPath(p), null, p);
  assert.equal(linkPath("/dashboard/plans"), "/dashboard/plans");
});
