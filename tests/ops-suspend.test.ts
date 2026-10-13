import { test } from "node:test";
import assert from "node:assert/strict";

process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");

test("only the super admin suspends ops staff, and nobody suspends the super admin", async () => {
  const { suspendRefusal } = await import("../src/lib/ops-access");
  const { PERMS } = await import("../src/lib/ops-perms");
  const sup = { super: true as const, role: "super" as const, perms: new Set(Object.keys(PERMS)) } as never;
  const care = { super: false as const, role: "care", perms: new Set(["users.support"]) } as never;
  const staff = { super: false as const, role: "developer", perms: new Set([]) } as never;
  assert.equal(suspendRefusal(care, null), null, "Care can suspend an ordinary account");
  assert.match(suspendRefusal(care, sup)!, /super admin can't be suspended/);
  assert.match(suspendRefusal(care, staff)!, /Only the super admin/);
  assert.equal(suspendRefusal(sup, staff), null, "the super admin can");
  assert.match(suspendRefusal(sup, sup)!, /can't be suspended/);
});
