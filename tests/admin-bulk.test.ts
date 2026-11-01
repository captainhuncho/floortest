import { test } from "node:test";
import assert from "node:assert/strict";
import { BULK_MAX, bulkIds, readPage, readSecurity, securityWhere } from "../src/lib/admin-bulk";

test("bulk ids keep whole positive numbers only, once each, at most BULK_MAX", () => {
  assert.deepEqual(bulkIds(["3", "3", "7", "0", "-1", "2.5", "1 OR 1=1", "", "abc"]), [3, 7]);
  const many = Array.from({ length: BULK_MAX + 20 }, (_, i) => String(i + 1));
  assert.equal(bulkIds(many).length, BULK_MAX, "a slip can't pick the whole list");
});

test("the Users page number falls back to 1", () => {
  assert.equal(readPage(undefined), 1);
  assert.equal(readPage("abc"), 1);
  assert.equal(readPage("-4"), 1);
  assert.equal(readPage("3"), 3);
  assert.equal(readPage("2.9"), 2);
});

test("the security filter picks one fixed SQL condition; anything else is no filter", () => {
  assert.equal(readSecurity("on"), "on");
  assert.equal(readSecurity("off"), "off");
  assert.equal(readSecurity("on' OR 1=1 --"), "");
  assert.equal(readSecurity(undefined), "");
  assert.equal(securityWhere("on"), "u.totp_enabled_at IS NOT NULL");
  assert.equal(securityWhere("off"), "u.totp_enabled_at IS NULL");
  assert.equal(securityWhere(""), "TRUE");
});
