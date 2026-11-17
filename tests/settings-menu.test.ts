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
  // Spec, section 6: no Plan, Pause, Played out, Receiving, Team, Invite a DJ or Delete account for Members.
  assert.deepEqual(shown(facts({ role: "member" })), ["contacts", "switchDesk"]);
});

test("a Member on one desk only gets no Switch desk row", () => {
  assert.deepEqual(shown(facts({ role: "member", desks: 1 })), ["contacts"]);
});

test("an A&R / Admin runs the desk but not the owner's login, plan or account", () => {
  const rows = settingsRows(facts({ role: "admin" }));
  for (const k of ["contacts", "playedOut", "pause", "receiving", "team", "editProfile", "switchDesk"] as const) assert.equal(rows[k], true, k);
  for (const k of ["notifications", "security", "plan", "inviteDj", "signOutEverywhere", "deleteAccount"] as const) assert.equal(rows[k], false, k);
});

test("the owner sees every row their desk has switched on", () => {
  assert.equal(Object.values(settingsRows(facts({}))).every(Boolean), true);
  const bare = settingsRows(facts({ teams: false, desks: 1, referrals: false, playedOut: false }));
  for (const k of ["team", "switchDesk", "inviteDj", "playedOut"] as const) assert.equal(bare[k], false, k);
  for (const k of ["plan", "pause", "receiving", "notifications", "security", "deleteAccount", "signOutEverywhere"] as const) assert.equal(bare[k], true, k);
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
  assert.match(read("lib/played-out-prompt.ts"), /canMarkPlayedOut = .*\n?.*user\.role !== "member"/);
  for (const name of ["pauseLink", "resumeLink"]) assert.match(action("desk.ts", name), /requireRole\("admin"\)/, name);
  assert.match(action("settings.ts", "deleteAccount"), /requireOwnAccount\(\)/);
});

test("sign out everywhere checks the password (and two-step code) before it ends any session", () => {
  const body = action("security.ts", "signOutEverywhere");
  assert.match(body, /await requireRole\("owner"\)/, "only on your own desk, like sign out other devices");
  assert.match(body, /await stepUp\(u\.id, /, "runs the step-up check");
  assert.match(body, /if \(denied\) return \{ error: denied \}/, "a failed check changes nothing");
  const check = body.indexOf("stepUp(");
  for (const change of ["revokeAllSessions(", "destroySession(", "redirect("]) assert.ok(check < body.indexOf(change), `${change} comes after the check`);
  assert.match(body, /revokeAllSessions\(u\.id\)/, "every session of this account, none kept: browsers, the app and the ops area");
  assert.match(body, /redirect\("\/signed-out"\)/);
});

test("delete account keeps the password and two-step check on the server", () => {
  const body = action("settings.ts", "deleteAccount");
  assert.ok(body.indexOf("stepUp(") < body.indexOf("requestDeletion("), "checked before anything is deleted");
  const sheet = read("app/dashboard/settings/(index)/SettingsMenu.tsx");
  assert.match(sheet, /name="password"/);
  assert.match(sheet, /name="code"/);
  assert.match(sheet, /typed\.trim\(\)\.toLowerCase\(\) !== handle/, "the button stays off until the link name matches");
});
