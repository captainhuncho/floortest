import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// The storage file list names every stored file of every account: a full inventory, so the super admin's alone,
// like the users CSV (not the Developer role's "storage" power).
test("the storage file list download is super-admin only", async () => {
  const src = fs.readFileSync(new URL("../src/app/api/admin/storage-manifest/route.ts", import.meta.url), "utf8");
  assert.match(src, /requireAdminAction\("super"\)/);
  const { SUPER_ONLY } = await import("../src/lib/ops-perms");
  assert.ok(SUPER_ONLY.some((s) => /storage file list/i.test(s)), "listed on the Ops team page as super-only");
  const check = fs.readFileSync(new URL("../scripts/check-admin-perms.ts", import.meta.url), "utf8");
  assert.match(check, /storage-manifest/, "the build check holds it to super");
});
