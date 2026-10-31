import { test } from "node:test";
import assert from "node:assert/strict";
import { isStaleDeploy } from "../src/lib/stale-deploy";

test("errors from a page left open across an update are read as stale", () => {
  for (const message of [
    'Failed to find Server Action "abc". This request might be from an older or newer deployment.',
    "Loading chunk 123 failed.",
    "Failed to fetch dynamically imported module: /_next/static/chunks/x.js",
    "Importing a module script failed.",
    "An unexpected response was received from the server.",
  ])
    assert.equal(isStaleDeploy(new Error(message)), true, message);
  const chunk = new Error("boom");
  chunk.name = "ChunkLoadError";
  assert.equal(isStaleDeploy(chunk), true);
});

test("ordinary errors are not read as stale, so the page offers Try again", () => {
  for (const message of ["Cannot read properties of undefined (reading 'id')", "An error occurred in the Server Components render.", ""])
    assert.equal(isStaleDeploy(new Error(message)), false, message);
});
