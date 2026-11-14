import { test } from "node:test";
import assert from "node:assert/strict";
import { folderId, recordId } from "../src/lib/ids";

test("record ids from the browser: only positive safe whole numbers", () => {
  for (const ok of [1, 42, "7", "123", Number.MAX_SAFE_INTEGER]) assert.equal(recordId(ok), Number(ok));
  for (const bad of [0, -1, 1.5, "abc", 2 ** 53, "1.5", "-1", "1e3", " 7", "0x10", "", null, undefined, NaN, Infinity, true, {}, [3]])
    assert.equal(recordId(bad), null, `refuses ${String(bad)}`);
});

test("project ids from the browser: empty is no project, anything else must be a record id", () => {
  assert.equal(folderId(null), null);
  assert.equal(folderId(""), null);
  assert.equal(folderId(9), 9);
  assert.equal(folderId("9"), 9);
  for (const bad of [0, -1, 1.5, "abc", 2 ** 53]) assert.ok(Number.isNaN(folderId(bad)), `refuses ${String(bad)}`);
});
