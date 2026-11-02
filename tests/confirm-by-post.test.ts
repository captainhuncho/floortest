import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Email links that act do it only from their button (a POST, the page's server action), never while the page renders on
// a GET, so a mail scanner opening the link changes nothing (link-page audit, 2 Nov). e2e/confirm-by-post.spec.ts
// presses the buttons.
test("the reopen and newsletter confirm pages don't act on GET", () => {
  for (const [page, fn] of [
    ["src/app/sent/reopen/[token]/page.tsx", "confirmReopenAlert"],
    ["src/app/newsletter/confirm/[token]/page.tsx", "confirmSubscription"],
  ]) {
    const src = fs.readFileSync(path.join(__dirname, "..", page), "utf8");
    assert.doesNotMatch(src, new RegExp(fn), `${page} renders without calling ${fn}`);
    assert.match(src, /ConfirmByPost/, `${page} asks first`);
  }
});
