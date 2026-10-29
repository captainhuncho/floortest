import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const fn = (file: string, name: string) => {
  const src = fs.readFileSync(new URL(`../src/app/dashboard/actions/${file}`, import.meta.url), "utf8");
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = src.indexOf("\nexport async function ", start + 1);
  return src.slice(start, next < 0 ? undefined : next);
};

test("removing a passkey, signing out other devices and turning sign-in alerts off ask for the password first", () => {
  for (const [file, name] of [["passkeys.ts", "deletePasskey"], ["security.ts", "signOutOtherDevices"], ["security.ts", "setSigninAlerts"]]) {
    const body = fn(file, name);
    assert.match(body, /await stepUp\(u\.id, /, `${name} runs the step-up check`);
    assert.ok(body.indexOf("stepUp(") < body.search(/removePasskey\(|revokeAllSessions\(|UPDATE users SET signin_alerts/), `${name} checks before it changes anything`);
  }
  assert.match(fn("security.ts", "setSigninAlerts"), /if \(!on\)/, "only turning alerts off needs it; turning them on doesn't");
});
