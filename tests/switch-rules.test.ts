import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// A throwaway local database for this test only, set before the app's modules load. The owner's email is the super admin.
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "ft-switch-rules-"));
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
process.env.ADMIN_EMAILS = "boss@x.io";
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const rule = (r: Partial<import("../src/lib/switch-rules").SwitchRule>) => ({ accounts: [], types: [], plans: [], countries: [], percent: 100, ...r });
const dj = { id: 7, plan: "pro", kind: "dj" as const };

test("each rule part: named accounts, type, plan, country; every part set must match", async () => {
  const { ruleCovers } = await import("../src/lib/switch-rules");
  assert.equal(ruleCovers("send_music", rule({ accounts: [7] }), dj, ""), true, "named account");
  assert.equal(ruleCovers("send_music", rule({ accounts: [8] }), dj, ""), false, "only the named accounts");
  assert.equal(ruleCovers("send_music", rule({ types: ["dj"] }), dj, ""), true, "account type");
  assert.equal(ruleCovers("send_music", rule({ types: ["curator"] }), dj, ""), false);
  assert.equal(ruleCovers("send_music", rule({ types: ["dj"] }), { ...dj, kind: null }, ""), false, "no type set never matches a type");
  assert.equal(ruleCovers("send_music", rule({ plans: ["pro"] }), dj, ""), true, "plan");
  assert.equal(ruleCovers("send_music", rule({ plans: ["team"] }), dj, ""), false);
  assert.equal(ruleCovers("send_music", rule({ countries: ["GB"] }), dj, "gb"), true, "country");
  assert.equal(ruleCovers("send_music", rule({ countries: ["GB"] }), dj, "FR"), false);
  assert.equal(ruleCovers("send_music", rule({ countries: ["GB"] }), dj, ""), false, "unknown country never matches");
  assert.equal(ruleCovers("send_music", rule({ countries: ["GB"] }), dj, null), true, "null skips the country part (admin's count)");
  assert.equal(ruleCovers("send_music", rule({ types: ["dj"], plans: ["team"] }), dj, ""), false, "type and plan both have to match");
  assert.equal(ruleCovers("send_music", rule({ accounts: [7], plans: ["team"] }), dj, ""), true, "named accounts get it whatever the rest says");
  assert.equal(ruleCovers("send_music", rule({ plans: ["team"] }), dj, "", true), true, "a super admin's desk can always test");
  assert.equal(ruleCovers("send_music", rule({ percent: 100, plans: ["pro"] }), null, "GB"), false, "no account: no rule matches");
});

test("percentage is stable per account and switch, and raising it only adds people", async () => {
  const { bucket, ruleCovers } = await import("../src/lib/switch-rules");
  const ids = Array.from({ length: 2000 }, (_, i) => i + 1);
  // Pro accounts, so 100% still narrows (a rule with nothing set is stored as no rule at all).
  const at = (p: number, key = "referrals") => new Set(ids.filter((id) => ruleCovers(key, rule({ plans: ["pro"], percent: p }), { ...dj, id }, "")));
  const twenty = at(20);
  assert.deepEqual([...at(20)], [...twenty], "same answer every time");
  assert.ok(twenty.size > 300 && twenty.size < 500, `about 20% of 2000, got ${twenty.size}`);
  for (const id of twenty) assert.ok(at(50).has(id), "everyone at 20% is still in at 50%");
  assert.equal(at(100).size, ids.length);
  assert.equal(bucket("referrals", 42), bucket("referrals", 42));
  const other = at(20, "send_music");
  assert.ok([...twenty].some((id) => !other.has(id)), "another switch picks a different slice");
});

test("stored rules are cleaned; an empty or unreadable rule is no rule", async () => {
  const { readRule, describeRule, parseCountries, clampPercent } = await import("../src/lib/switch-rules");
  assert.equal(readRule(null), null);
  assert.equal(readRule("not json"), null);
  assert.equal(readRule(JSON.stringify(rule({}))), null, "nothing set: everyone");
  const r = readRule(JSON.stringify({ accounts: [3, -1, "x", 3], types: ["dj", "astronaut"], plans: ["pro", "DROP TABLE"], countries: ["gb", "GB", "FRA"], percent: 250 }));
  assert.deepEqual(r, { accounts: [3], types: ["dj"], plans: ["pro"], countries: ["GB"], percent: 100 });
  assert.deepEqual(parseCountries("gb, ie;  usa au"), ["GB", "IE", "AU"]);
  assert.equal(clampPercent("0"), 1);
  assert.equal(clampPercent(""), 100);
  assert.equal(describeRule(rule({ types: ["dj"], plans: ["pro"], percent: 20 }), () => "Pro"), "20% of accounts DJ, on Pro");
  assert.equal(describeRule(rule({ accounts: [1, 2] })), "Only 2 named accounts");
});

test("from the server: off beats any rule, a rule keeps the feature from accounts outside it, old code still works", async () => {
  const { q } = await import("../src/lib/db");
  const { switchOn, setSwitch, setSwitchRule, switchState, ruleCoverage } = await import("../src/lib/switches");
  const { canAddCollection } = await import("../src/lib/desk");
  const { teamsOn } = await import("../src/lib/account-members");
  const t = Date.now();
  const user = async (handle: string, email: string, plan: string, kind: string) =>
    (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, plan, kind, tz, created_at) VALUES (?, 'h', ?, ?, ?, ?, 'UTC', ?) RETURNING id", email, handle, handle, plan, kind, t))!.id;
  const inside = await user("inside", "in@x.io", "pro", "dj");
  const outside = await user("outside", "out@x.io", "free", "curator");
  const named = await user("named", "named@x.io", "free", "artist");
  const boss = await user("boss", "boss@x.io", "free", "label_radio");
  for (const d of [inside, outside]) for (const n of ["One", "Two"]) await q.run("INSERT INTO collections (user_id, name, created_at) VALUES (?,?,?)", d, n, t);

  // On with a rule: Pro DJs, plus one named account.
  await setSwitch("more_collections", true, boss);
  await setSwitchRule("more_collections", rule({ types: ["dj"], plans: ["pro"], accounts: [named] }), boss);
  assert.equal(await canAddCollection(inside), true, "inside the rule: no beta limit");
  assert.equal(await canAddCollection(outside), false, "outside the rule: still two collections, enforced on the server");
  assert.equal(await switchOn("more_collections", named), true, "named account");
  assert.equal(await switchOn("more_collections", boss), true, "super admin's desk");
  assert.equal(await switchOn("more_collections", null), false, "no account");
  assert.deepEqual(await ruleCoverage("more_collections", (await switchState("more_collections")).rule!), { covered: 3, total: 4 });

  // Old code's flip (no rule column in its SQL) leaves the rule alone, and its read still works.
  await q.run("INSERT INTO switches (key, on_, admin_id, updated_at) VALUES ('more_collections', 0, ?, ?) ON CONFLICT (key) DO UPDATE SET on_ = excluded.on_, admin_id = excluded.admin_id, updated_at = excluded.updated_at", boss, t);
  assert.equal(Number((await q.get<{ on: number }>("SELECT on_ AS on FROM switches WHERE key = 'more_collections'"))!.on), 0);
  assert.ok((await switchState("more_collections")).rule, "rule kept");

  // Off beats the rule, for named accounts and super admins too.
  assert.equal(await switchOn("more_collections", named), false);
  assert.equal(await switchOn("more_collections", boss), false);
  assert.equal(await canAddCollection(inside), false);

  // Teams: a rule for one desk; the super admin keeps teams with the switch off, as before.
  await setSwitch("teams", true, boss);
  await setSwitchRule("teams", rule({ accounts: [inside] }), boss);
  assert.equal(await teamsOn(inside), true);
  assert.equal(await teamsOn(outside), false, "outside the rule: no teams from the server");
  await setSwitch("teams", false, boss);
  assert.equal(await teamsOn(boss), true, "super admin's desk, switch off");
  assert.equal(await teamsOn(inside), false);

  // Cleared: on for everyone again.
  await setSwitch("more_collections", true, boss);
  await setSwitchRule("more_collections", null, boss);
  assert.equal(await canAddCollection(outside), true);
});
