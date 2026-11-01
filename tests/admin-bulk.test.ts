import { test } from "node:test";
import assert from "node:assert/strict";
import { BULK_MAX, bulkIds, readPage, readSecurity, securityWhere } from "../src/lib/admin-bulk";

test("bulk ids keep whole positive numbers only, once each; more than BULK_MAX is refused, not cut", () => {
  assert.deepEqual(bulkIds(["3", "3", "7", "0", "-1", "2.5", "1 OR 1=1", "", "abc"]), [3, 7]);
  const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1));
  assert.equal(bulkIds(ids(BULK_MAX))?.length, BULK_MAX);
  assert.equal(bulkIds(ids(BULK_MAX + 20)), null, "a hand-made request for the whole list is refused");
  assert.equal(bulkIds([...ids(BULK_MAX), "1", "2"])?.length, BULK_MAX, "repeats don't count against the limit");
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
