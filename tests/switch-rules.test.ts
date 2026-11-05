import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load. The owner's email is the super admin.
process.env.DATA_DIR = testDataDir("ft-switch-rules-");
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

test("stored rules are cleaned; nothing stored or nothing set is no rule, and an unreadable rule reaches nobody", async () => {
  const { readRule, describeRule, parseCountries, clampPercent, ruleCovers } = await import("../src/lib/switch-rules");
  assert.equal(readRule(null), null);
  assert.equal(readRule(""), null);
  assert.equal(readRule(JSON.stringify(rule({}))), null, "nothing set: everyone");
  // Anything stored that can't be read reaches nobody (before, each read as no rule, which is everyone).
  for (const bad of ["not json", "null", "42", '"text"', "[]", '{"types":"dj"}', '{"accounts":{}}', '{"percent":"abc"}', '{"accounts":[-1,"x"]}']) {
    const r = readRule(bad);
    assert.ok(r, `${bad}: not no rule`);
    assert.ok(r!.lost?.length, `${bad}: lost`);
    assert.equal(ruleCovers("x", r!, dj, ""), false, `${bad}: covers nobody`);
  }
  const r = readRule(JSON.stringify({ accounts: [3, -1, "x", 3], types: ["dj", "astronaut"], plans: ["pro", "DROP TABLE"], countries: ["gb", "GB", "FRA"], percent: 250 }));
  assert.deepEqual(r, { accounts: [3], types: ["dj"], plans: ["pro"], countries: ["GB"], percent: 100 });
  assert.deepEqual(parseCountries("gb, ie;  usa au"), ["GB", "IE", "AU"]);
  assert.equal(clampPercent("0"), 1);
  assert.equal(clampPercent(""), 100);
  assert.equal(describeRule(rule({ types: ["dj"], plans: ["pro"], percent: 20 }), () => "Pro"), "20% of accounts DJ, on Pro");
  assert.equal(describeRule(rule({ accounts: [1, 2] })), "Only 2 named accounts");
});

test("fail closed: a rule whose types, plans or countries no longer exist covers only its named accounts", async () => {
  const { readRule, ruleCovers, ruleIsLost, describeRule } = await import("../src/lib/switch-rules");
  // Each lost part on its own, with no named accounts: before, each read as no rule, which is everyone.
  const cases = [
    { part: { types: ["radio_station"] }, words: "Nobody: its account types no longer exist" },
    { part: { plans: ["NOT A PLAN"] }, words: "Nobody: its plans no longer exist" },
    { part: { countries: ["FRA"] }, words: "Nobody: its countries can't be read" },
  ];
  for (const { part, words } of cases) {
    const lost = readRule(JSON.stringify({ accounts: [], types: [], plans: [], countries: [], percent: 100, ...part }));
    assert.ok(lost && ruleIsLost(lost), `${words}: lost, not no rule`);
    for (const country of ["", "GB", null]) assert.equal(ruleCovers("x", lost!, dj, country), false, `${words}: covers nobody`);
    assert.equal(describeRule(lost!), words);
  }
  // A lost part next to a surviving plan still covers nobody, and keeps its own percentage.
  const mixed = readRule(JSON.stringify({ accounts: [], types: ["radio_station"], plans: ["pro"], countries: [], percent: 20 }))!;
  assert.deepEqual(mixed.lost, ["types"]);
  assert.equal(mixed.percent, 20, "the stored percentage is kept");
  for (let id = 1; id <= 200; id++) assert.equal(ruleCovers("x", mixed, { ...dj, id }, ""), false, "a surviving plan doesn't reopen it");
  const named = readRule(JSON.stringify({ accounts: [9], types: ["radio_station"], plans: [], countries: [], percent: 100 }))!;
  assert.equal(ruleCovers("x", named, { ...dj, id: 9 }, ""), true, "named accounts still get it");
  assert.equal(ruleCovers("x", named, dj, ""), false);
  assert.equal(describeRule(named), "Only 1 named account; nobody else: its account types no longer exist");
  assert.equal(ruleIsLost(readRule(JSON.stringify({ accounts: [], types: ["dj", "radio_station"], plans: [], countries: [], percent: 100 }))!), false, "a surviving type keeps a working rule");
});

test("saving a rule form: a page from another release and an unchanged save over a lost rule are refused", async () => {
  const { readRule, ruleFromForm } = await import("../src/lib/switch-rules");
  const PLANS = ["free", "pro", "team"];
  const form = (fields: Record<string, string>) => ({ keys: Object.keys(fields), get: (k: string) => fields[k] ?? null });
  const save = (fields: Record<string, string>, stored: string | null = null, accounts: number[] = []) => ruleFromForm(form(fields), accounts, PLANS, readRule(stored));
  const ok = (r: ReturnType<typeof save>) => {
    assert.ok("rule" in r, "error" in r ? r.error : "");
    return (r as { rule: unknown }).rule;
  };
  const refused = (r: ReturnType<typeof save>, why: RegExp) => assert.match("error" in r ? r.error : "saved", why);
  const working = JSON.stringify({ accounts: [], types: ["dj"], plans: [], countries: [], percent: 100 });

  // A page from another release: a type or plan this release doesn't know is refused, never dropped (dropping it here
  // over a DJ rule would have saved no rule, which is everyone). Since the split, the old release's form sends
  // type_label_radio; before it, a form from the split release sent type_label or type_radio.
  refused(save({ type_label_radio: "on", percent: "100" }, working), /out of date/);
  refused(save({ type_dj: "on", type_radio_station: "on", percent: "100" }, working), /out of date/);
  assert.deepEqual(ok(save({ type_label: "on", type_radio: "on", percent: "100" }, working)), { accounts: [], types: ["label", "radio"], plans: [], countries: [], percent: 100 });
  refused(save({ plan_enterprise: "on", percent: "100" }, working), /out of date/);
  refused(save({ countries: "GB FRA", percent: "100" }, working), /two-letter/);
  assert.deepEqual(ok(save({ type_dj: "on", countries: "gb, ie", percent: "50" }, working)), { accounts: [], types: ["dj"], plans: [], countries: ["GB", "IE"], percent: 50 });
  assert.equal(ok(save({ percent: "100" }, working)), null, "clearing a working rule by emptying the form works as before");

  // Over a lost rule: an unchanged save (the form shows the surviving plan and the stored percentage) is refused.
  const lost = JSON.stringify({ accounts: [], types: ["radio_station"], plans: ["pro"], countries: [], percent: 20 });
  refused(save({ plan_pro: "on", percent: "20" }, lost), /reaches nobody because its account types no longer exist/);
  refused(save({ plan_pro: "on", percent: "100" }, lost), /reaches nobody/);
  refused(save({ percent: "100" }, lost), /reaches nobody/);
  refused(save({ percent: "100" }, lost, [3]), /reaches nobody/);
  // Setting the lost part again is fine.
  assert.deepEqual(ok(save({ type_dj: "on", plan_pro: "on", percent: "20" }, lost)), { accounts: [], types: ["dj"], plans: ["pro"], countries: [], percent: 20 });
  // An unreadable stored rule: any explicit rule (named accounts or a part) replaces it; an empty form doesn't.
  refused(save({ percent: "100" }, "not json"), /the stored rule can't be read/);
  assert.ok(ok(save({ percent: "100" }, "not json", [3])), "named accounts only is fine");
});

test("the switches action and page are wired to the fail-closed checks", () => {
  const read = (f: string) => fs.readFileSync(new URL(f, import.meta.url), "utf8");
  const actions = read("../src/app/admin/actions.ts");
  const save = actions.slice(actions.indexOf("export async function saveSwitchRule(")).split("\nexport ")[0];
  assert.match(save, /const stored = readRule\(\(await q\.get<\{ rule: string \| null \}>\("SELECT rule FROM switches WHERE key = \?", key\)\)\?\.rule\);/, "reads the stored rule from the database");
  assert.match(save, /const asked = ruleFromForm\(\{ keys: \[\.\.\.form\.keys\(\)\], get: \(k\) => form\.get\(k\) \}, [^\n]*, stored\);\s*if \("error" in asked\) return fail\(asked\.error\);\s*const rule = asked\.rule;\s*await setSwitchRule\(key, rule, a\.id\);/, "every field goes through the check, and a refusal saves nothing");
  const page = read("../src/app/admin/switches/page.tsx");
  assert.match(page, /\{rule && ruleIsLost\(rule\) && \(\s*<p role="alert"[^]*?Review this rule\.[^]*?\{lostWords\(rule\)\}/, "a lost rule shows the Review this rule note with the reason");
  assert.match(page, /name="percent"[^>]*defaultValue=\{rule\?\.percent \?\? 100\}/, "the form shows the stored percentage, not a wider one");
  for (const f of ["../src/app/admin/accounts/page.tsx", "../src/app/admin/accounts/crm/CrmUsers.tsx"])
    assert.match(read(f), /label: "Type", value: kindLabel\(aud\.kind\)/, `${f}: an unknown type shows as "Unknown type (nobody)"`);
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
  const boss = await user("boss", "boss@x.io", "free", "label");
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
