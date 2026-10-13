import { test } from "node:test";
import assert from "node:assert/strict";
import { localPath } from "../src/lib/next-path";

test("the coming-soon gate only sends people back to a page on this site", () => {
  assert.equal(localPath("/pricing"), "/pricing");
  assert.equal(localPath("/maxwell?x=1"), "/maxwell?x=1");
  assert.equal(localPath("/%0a"), "/%0a", "an encoded newline stays a path on this site");
  for (const bad of ["/\\evil.com", "//evil.com", "/\\/evil.com", "https://evil.com", "/\t/evil.com", "/coming-soon", ""]) assert.equal(localPath(bad), "/", bad);
});
