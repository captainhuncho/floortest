import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("turning two-factor off checks the code the way sign-in does, so it can't be replayed", () => {
  const src = fs.readFileSync(new URL("../src/app/dashboard/actions/security.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function disableTwoFactor"), src.indexOf("export async function setSigninAlerts"));
  assert.match(body, /checkSecondFactor\(u\.id, /, "goes through checkSecondFactor (records the step, uses up a recovery code)");
  assert.doesNotMatch(body, /verifyTotp|hashRecovery/, "no separate code check of its own");
});
