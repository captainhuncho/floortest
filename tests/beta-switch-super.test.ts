import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

// Beta started (and every other site-wide switch) is the super admin's (Safety, 4 Nov): Developer and Product Lead
// hold "switches" for per-feature rollouts, but flipping a site-wide switch or its rule needs "super" on the server.
const actions = fs.readFileSync(new URL("../src/app/admin/actions.ts", import.meta.url), "utf8");
const body = (name: string) => actions.slice(actions.indexOf(`export async function ${name}(`)).split("\nexport ")[0];

test("flipping a site-wide switch or its rule requires the super admin on the server", async () => {
  for (const name of ["flipSwitch", "saveSwitchRule", "clearSwitchRule"]) {
    assert.match(body(name), /^[^]*?\{\s*const a = await requireAdminAction\("super"\);/, `${name} checks super before anything else`);
  }
  const { ACTION_NEEDS, SUPER_ONLY } = await import("../src/lib/ops-perms");
  assert.equal(ACTION_NEEDS.flipSwitch, "super");
  assert.equal(ACTION_NEEDS.saveSwitchRule, "super");
  assert.ok(SUPER_ONLY.some((s) => /beta started/i.test(s)), "listed on the Ops team page as super-only");
});

test("developer and product lead keep per-feature switches but can't flip site-wide ones", async () => {
  const { ROLE_PERMS } = await import("../src/lib/ops-perms");
  const { can } = await import("../src/lib/ops-access");
  for (const role of ["developer", "product"] as const) {
    const access = { super: false as const, role, perms: new Set(ROLE_PERMS[role]) };
    assert.equal(can(access, "switches"), true, `${role} opens Feature switches`);
    assert.equal(can(access, "super"), false, `${role} can't flip Beta started`);
  }
  const boss = { super: true as const, role: "super" as const, perms: new Set<never>() };
  assert.equal(can(boss, "super"), true, "the super admin can");
});

test("a refused flip is logged as denied and changes nothing", () => {
  const guard = fs.readFileSync(new URL("../src/lib/admin.ts", import.meta.url), "utf8");
  const fn = guard.slice(guard.indexOf("export async function requireAdminAction")).split("\nexport ")[0];
  assert.match(fn, /if \(!can\(u\.access, need\)\) \{\s*await logAdmin\(u\.id, "denied", need\);[^}]*redirect\(/, "logs denied, then leaves before the switch is touched");
});

test("staff without super see site-wide switches read-only", () => {
  const page = fs.readFileSync(new URL("../src/app/admin/switches/page.tsx", import.meta.url), "utf8");
  assert.match(page, /const owner = can\(me\.access, "super"\)/);
  assert.match(page, /\{owner && !blocked\.length && \(\s*<ConfirmButton\s+action=\{flipSwitch/, "the toggle shows only to the super admin");
  assert.match(page, /Only the owner can change this/);
  assert.match(page, /readOnly=\{!owner\}/, "the who-sees-it rule form is read-only too");
});
