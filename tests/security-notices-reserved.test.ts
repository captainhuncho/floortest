import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

// Security notices tell someone their account changed or was used. They must still send when the day's email is nearly
// used up, like sign-in codes and resets: each is queued with reserved: true (lib/mail-quota, MAIL_RESERVED_SHARE).
const NOTICES: [string, string][] = [
  ["src/app/dashboard/actions/security.ts", "Your FloorTest password was changed"],
  ["src/app/dashboard/actions/security.ts", "Two-factor sign-in was turned on"],
  ["src/app/dashboard/actions/security.ts", "Two-factor sign-in was turned off"],
  ["src/app/dashboard/actions/passkeys.ts", "A passkey was added to your FloorTest account"],
  ["src/app/dashboard/actions/passkeys.ts", "A passkey was removed from your FloorTest account"],
  ["src/lib/google-link.ts", "Google sign-in was added to your account"],
  ["src/lib/google-link.ts", "Google sign-in was removed from your account"],
  ["src/lib/security.ts", "New sign-in to FloorTest"],
  ["src/app/(auth)/actions.ts", "Someone tried to sign up with your email"],
  ["src/app/dashboard/actions/settings.ts", "Your FloorTest account was deleted"],
];

test("security notices are queued as reserved email, so a busy day can't hold them back", () => {
  for (const [file, subject] of NOTICES) {
    const src = readFileSync(path.join(__dirname, "..", file), "utf8");
    const at = src.indexOf(subject);
    assert.ok(at > 0, `${file}: "${subject}" not found`);
    const start = src.lastIndexOf("sendMail", at);
    const end = src.indexOf("});", at);
    assert.match(src.slice(start, end), /reserved: true/, `${file}: "${subject}" is not reserved`);
  }
});
