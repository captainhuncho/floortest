import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { settingsRows, type SettingsFacts } from "../src/lib/settings-menu";

const read = (path: string) => fs.readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
const action = (file: string, name: string) => {
  const src = read(`app/dashboard/actions/${file}`);
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} exists`);
  const next = src.indexOf("\nexport async function ", start + 1);
  return src.slice(start, next < 0 ? undefined : next);
};

const facts = (over: Partial<SettingsFacts>): SettingsFacts => ({ role: "owner", teams: true, desks: 2, referrals: true, playedOut: true, ...over });
const shown = (f: SettingsFacts) =>
  Object.entries(settingsRows(f))
    .filter(([, on]) => on)
    .map(([k]) => k)
    .sort();

test("a Member sees Contacts and Switch desk, and nothing they can't use", () => {
  // Spec, section 6: no Plan, Pause, Analytics, Played out, Receiving, Team, Invite a DJ or Delete account for Members.
  assert.deepEqual(shown(facts({ role: "member" })), ["contacts", "switchDesk"]);
});

test("a Member on one desk only gets no Switch desk row", () => {
  assert.deepEqual(shown(facts({ role: "member", desks: 1 })), ["contacts"]);
});

test("an A&R / Admin runs the desk but not the owner's login, plan or account", () => {
  const rows = settingsRows(facts({ role: "admin" }));
  for (const k of ["contacts", "analytics", "playedOut", "pause", "receiving", "team", "editProfile", "switchDesk"] as const) assert.equal(rows[k], true, k);
  for (const k of ["notifications", "security", "plan", "inviteDj", "signOutAllMyDevices", "deleteAccount"] as const) assert.equal(rows[k], false, k);
});

test("the owner sees every row their desk has switched on", () => {
  assert.equal(Object.values(settingsRows(facts({}))).every(Boolean), true);
  const bare = settingsRows(facts({ teams: false, desks: 1, referrals: false, playedOut: false }));
  for (const k of ["team", "switchDesk", "inviteDj", "playedOut"] as const) assert.equal(bare[k], false, k);
  for (const k of ["plan", "pause", "analytics", "receiving", "notifications", "security", "deleteAccount", "signOutAllMyDevices"] as const) assert.equal(bare[k], true, k);
});

test("every row a Member doesn't see is also refused by the server", () => {
  // Hiding a row is never the guard: each page or action behind it checks the role itself.
  assert.match(read("app/dashboard/settings/plan/page.tsx"), /requireRole\("owner"\)/);
  assert.match(read("app/dashboard/plans/page.tsx"), /requireRole\("owner"\)/);
  assert.match(read("app/dashboard/settings/receiving/page.tsx"), /requireRole\("admin"\)/);
  assert.match(read("app/dashboard/settings/profile/page.tsx"), /requireRole\("admin"\)/);
  assert.match(read("app/dashboard/settings/notifications/page.tsx"), /requireRole\("owner"\)/);
  assert.match(read("app/dashboard/settings/security/page.tsx"), /requireRole\("owner"\)/);
  assert.match(read("app/dashboard/referrals/page.tsx"), /requireRole\("owner"\)/);
  assert.match(read("app/dashboard/analytics/page.tsx"), /requireRole\("admin"\)/);
  // The Analytics line's numbers come only from settingsWeek, which reads nothing for a Member
  // (behaviour test in tests/sign-out-everywhere.test.ts).
  assert.match(read("app/dashboard/settings/(index)/page.tsx"), /settingsWeek\(user\)/);
  assert.match(read("lib/played-out-prompt.ts"), /canMarkPlayedOut = .*\n?.*user\.role !== "member"/);
  // Played out: the page opens only when playedOutPicks answers, and that answers no one who can't mark tracks.
  assert.match(read("lib/played-out-prompt.ts"), /export async function playedOutPicks\([^]*?\{\s*if \(!canMarkPlayedOut\(user\)\) return null;/);
  assert.match(read("app/dashboard/played-out/page.tsx"), /const picks = await playedOutPicks\(user\);\s*if \(!picks\) redirect\("\/dashboard\/floor"\);/);
  // Team: open to Members on purpose (it is where "not for your role" lands and where they see their own held
  // replies). Its manage controls are admin-gated instead: each one renders only when `manage` is true.
  const team = read("app/dashboard/settings/team/page.tsx");
  assert.match(team, /const manage = atLeast\(user\.role, "admin"\) && !ownerNeedsTwoStep\(user\);/);
  for (const control of ["<InviteForm", "<CancelInviteForm", "<ApprovalForm"]) assert.match(team, new RegExp(`manage (&&|\\?) ${control}`), control);
  assert.match(team, /user\.role === "owner" \? <RoleSelect/, "only the owner changes roles");
  for (const name of ["pauseLink", "resumeLink"]) assert.match(action("desk.ts", name), /requireRole\("admin"\)/, name);
  assert.match(action("settings.ts", "deleteAccount"), /requireOwnAccount\(\)/);
});

test("sign out everywhere checks the password (and two-step code) before it ends any session", () => {
  const body = action("security.ts", "signOutAllMyDevices");
  assert.match(body, /await requireRole\("owner"\)/, "only on your own desk, like sign out other devices");
  assert.match(body, /const denied = await endEverySession\(u\.id, /, "the check and the revoke are one call");
  assert.match(body, /if \(denied\) return \{ error: denied \}/, "a failed check changes nothing");
  const ended = body.indexOf("endEverySession(");
  for (const after of ["audit(", "destroySession(", "redirect("]) assert.ok(ended < body.indexOf(after), `${after} comes after the sessions are gone`);
  assert.match(body, /try \{\s*await audit\([^]*?await audit\([^]*?\} catch \(e\) \{\s*console\.error\([^]*?\}\s*await destroySession\(\);/, "a failed audit is logged and never skips ending this session");
  assert.match(body, /redirect\("\/signed-out"\)/);
  // The ops action of the old name lives in admin/actions.ts; the desk one must not share it.
  assert.doesNotMatch(read("app/dashboard/actions/security.ts"), /export async function signOutEverywhere\(/);
  const lib = read("lib/step-up.ts");
  const fn = lib.slice(lib.indexOf("export async function endEverySession("));
  assert.ok(fn.indexOf("stepUp(") < fn.indexOf("revokeAllSessions(userId)"), "checked first, then every session, none kept");
});

test("delete account keeps the password and two-step check on the server", () => {
  const body = action("settings.ts", "deleteAccount");
  assert.ok(body.indexOf("stepUp(") < body.indexOf("requestDeletion("), "checked before anything is deleted");
  const sheet = read("app/dashboard/settings/(index)/SettingsMenu.tsx");
  assert.match(sheet, /name="password"/);
  assert.match(sheet, /name="code"/);
  assert.match(sheet, /typed\.trim\(\)\.toLowerCase\(\) !== handle/, "the button stays off until the link name matches");
});
