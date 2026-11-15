import assert from "node:assert/strict";
import { test } from "node:test";
import { isAppUserAgent } from "../src/lib/app-ua";

test("the app's web view is told apart from a browser by its user-agent marker", () => {
  assert.equal(isAppUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FloorTestApp"), true);
  assert.equal(isAppUserAgent("Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 Chrome/131.0 Mobile Safari/537.36 FloorTestApp"), true);
  assert.equal(isAppUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1"), false);
  assert.equal(isAppUserAgent("NotFloorTestAppX"), false);
  assert.equal(isAppUserAgent(""), false);
});
