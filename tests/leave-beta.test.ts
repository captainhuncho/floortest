import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-leave-beta-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// Ops → Leave beta (Safety, 13 Nov): super admin only, the same flipSwitch as Feature switches, a blocked switch can't
// be turned on from either page, and every flip and checklist mark goes in the admin log.
const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const actions = read("../src/app/admin/actions.ts");
const body = (name: string) => actions.slice(actions.indexOf(`export async function ${name}(`)).split("\nexport ")[0];

test("staff without super can't open the page or flip a row", async () => {
  const page = read("../src/app/admin/leave-beta/page.tsx");
  assert.match(page, /await requireAdmin\("super"\);/, "the page checks super on the server");
  const { PAGE_NEEDS, ACTION_NEEDS, ROLE_PERMS } = await import("../src/lib/ops-perms");
  const { can } = await import("../src/lib/ops-access");
  assert.equal(PAGE_NEEDS["/admin/leave-beta"], "super");
  assert.equal(ACTION_NEEDS.flipSwitch, "super");
  assert.equal(ACTION_NEEDS.markLaunchCheck, "super");
  for (const role of ["developer", "product"] as const) {
    assert.equal(can({ super: false, role, perms: new Set(ROLE_PERMS[role]) }, "super"), false, `${role} is refused`);
  }
  for (const name of ["flipSwitch", "markLaunchCheck"]) {
    assert.match(body(name), /^[^]*?\{\s*const a = await requireAdminAction\("super"\);/, `${name} checks super before anything else`);
  }
});

test("the page flips through flipSwitch only, one row at a time", () => {
  const page = read("../src/app/admin/leave-beta/page.tsx");
  assert.doesNotMatch(page, /setSwitch|q\.run|from "@\/lib\/db"/, "no second write path");
  assert.equal((page.match(/action=\{flipSwitch\.bind\(null, k, !on\)\}/g) ?? []).length, 1, "one toggle, used row by row");
  assert.doesNotMatch(page, /turn (all|everything)|do all|leave beta now/i, "no master button");
});

test("billing waits on both checklist items; marking them done clears it", async () => {
  const { q } = await import("../src/lib/db");
  const { openBlockers, setLaunchCheck } = await import("../src/lib/launch-checks");
  assert.deepEqual(await openBlockers("billing"), ["card_payments", "renewal_wording"], "not marked yet is not done");
  assert.deepEqual(await openBlockers("open_signup"), ["signup_bot_protection"], "open sign-up waits on the bot fixes");
  assert.deepEqual(await openBlockers("beta_started"), [], "other switches wait on nothing");

  const t = Date.now();
  const owner = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('owner@example.test', 'h', 'Owner', 'owner', 'free', 'UTC', ?, ?) RETURNING id",
    t,
    t,
  ))!.id;
  await setLaunchCheck("card_payments", true, owner);
  assert.deepEqual(await openBlockers("billing"), ["renewal_wording"]);
  await setLaunchCheck("renewal_wording", true, owner);
  assert.deepEqual(await openBlockers("billing"), []);
  await setLaunchCheck("card_payments", false, owner);
  assert.deepEqual(await openBlockers("billing"), ["card_payments"], "unmarking blocks it again");
});

test("a blocked switch is refused before it is touched, and the refusal is logged", () => {
  const fn = body("flipSwitch");
  const refuse = fn.indexOf("if (open.length)");
  assert.match(fn, /const open = on \? await openBlockers\(key\) : \[\];/, "checks the checklist; turning off is never blocked");
  assert.ok(refuse > -1 && refuse < fn.indexOf("await setSwitch("), "refuses before writing the switch");
  assert.match(fn.slice(refuse, fn.indexOf("await setSwitch(")), /logAdmin\(a\.id, "switch refused"[^]*return fail\(/);
  const switches = read("../src/app/admin/switches/page.tsx");
  assert.match(switches, /const blocked = on \? \[\] : await openBlockers\(key\);/);
  assert.match(switches, /\{owner && !blocked\.length && \(\s*<ConfirmButton\s+action=\{flipSwitch/, "Feature switches hides the toggle too");
});

test("each flip and each checklist mark writes an admin log line", () => {
  const flip = body("flipSwitch");
  assert.ok(flip.indexOf('logAdmin(a.id, on ? "switched on" : "switched off"') > flip.indexOf("await setSwitch("), "logged after the flip");
  const mark = body("markLaunchCheck");
  assert.ok(mark.indexOf('logAdmin(a.id, isDone ? "marked done" : "marked not done"') > mark.indexOf("await setLaunchCheck("), "logged after the mark");
});
