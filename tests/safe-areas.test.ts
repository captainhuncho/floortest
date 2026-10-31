import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Owner's "Every device" rule: safe areas respected. Without viewport-fit=cover iOS reports every env(safe-area-inset-*)
// as 0, so the 40-odd notch and home-bar paddings across the app do nothing (council check, 31 Oct).
test("root viewport opts into the whole screen so safe-area insets are real on iPhones", () => {
  const layout = fs.readFileSync("src/app/layout.tsx", "utf8");
  assert.match(layout, /viewportFit:\s*"cover"/);
});

// Cover also hands the landscape notch area to the page, so the body keeps content clear of it on both sides.
test("body pads left and right by the side insets", () => {
  const css = fs.readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /body\s*\{[^}]*padding-left:\s*env\(safe-area-inset-left\)/);
  assert.match(css, /body\s*\{[^}]*padding-right:\s*env\(safe-area-inset-right\)/);
});
