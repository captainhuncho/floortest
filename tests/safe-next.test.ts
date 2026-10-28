import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "../src/lib/next-path";

const invite = "Ab3_-xYz0123456789abcdEF";

test("after sign-in, only a shared collection or a team invite is a place to land", () => {
  assert.equal(safeNext("/c/a.12"), true);
  assert.equal(safeNext(`/join/${invite}`), true);
});

test("after sign-in, open-redirect variants and other pages are refused", () => {
  const bad = [
    // Other sites, however they're spelt.
    "//evil.com", "/\\evil.com", "\\\\evil.com", "https://evil.com", "http://evil.com/c/a.12", "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>", "/%2F%2Fevil.com", "%2F%2Fevil.com", "/%5Cevil.com", "/c/a.12%2F%2Fevil.com",
    // Look-alikes of the allowed shapes with something added.
    "/c/a.12//evil.com", "/c/a.12/../../evil", "/c/a.12?next=//evil.com", "/c/a.12#//evil.com", "/c/a.1234567890123",
    `/join/${invite}/../../evil`, `/join/${invite}?x=1`, "/join/short", `//join/${invite}`,
    // Whitespace and control characters.
    " /c/a.12", "/c/a.12 ", "/c/a.12\n", "\n/c/a.12", "/c/a.12\t", "/\t/evil.com", "/c/a.12\x00", `/join/${invite}\r\n`,
    // A real page on this site is still not a sign-in destination (the desk is the default anyway).
    "/desk", "/dashboard", "",
  ];
  for (const next of bad) assert.equal(safeNext(next), false, JSON.stringify(next));
});
