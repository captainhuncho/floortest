import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-account-types-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("eight types; each switches its own tools on by default and never locks the others", async () => {
  const { ACCOUNT_TYPES, hasTool, isAccountType, toolOverrides } = await import("../src/lib/account-types");
  assert.deepEqual(Object.keys(ACCOUNT_TYPES), ["dj", "producer_dj", "ar", "label", "radio", "artist", "curator", "music_pro"]);
  assert.equal(isAccountType("curator"), true);
  assert.equal(isAccountType("producer"), false, "the old ids are gone");
  assert.equal(isAccountType("toString"), false);

  // Defaults by type.
  for (const kind of ["dj", "producer_dj", "curator"] as const) assert.equal(hasTool({ kind }, "played_out"), true, kind);
  for (const kind of ["ar", "label", "radio", "artist", "music_pro"] as const) assert.equal(hasTool({ kind }, "played_out"), false, kind);
  assert.equal(hasTool({ kind: null }, "played_out"), false);

  // Anyone can switch a tool on or off; only choices that differ from the type's default are stored.
  assert.equal(hasTool({ kind: "label", tools: '{"played_out":true}' }, "played_out"), true);
  assert.equal(hasTool({ kind: "dj", tools: '{"played_out":false}' }, "played_out"), false);
  assert.equal(hasTool({ kind: "dj", tools: "not json" }, "played_out"), true, "an unreadable value falls back to the default");
  assert.equal(toolOverrides("dj", { played_out: true }), null);
  assert.equal(toolOverrides("dj", { played_out: false }), '{"played_out":false}');
  assert.equal(toolOverrides("ar", { played_out: true }), '{"played_out":true}');
});

test("existing accounts move to the nearest new type, and the database refuses unknown types", async () => {
  const { q } = await import("../src/lib/db");
  const add = (handle: string, kind: string | null) =>
    q.run("INSERT INTO users (email, password_hash, name, handle, plan, kind, created_at) VALUES (?, 'h', ?, ?, 'free', ?, 1)", `${handle}@x.io`, handle, handle, kind);
  // Every migration has run by now; replay the type move on rows written with the old ids, as the migration did.
  await q.run("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_kind_check");
  await add("olddj", "dj");
  await add("oldproducer", "producer");
  await add("oldlabel", "label");
  await add("unset", null);
  const migration = (await import("../src/lib/db/migrations")).MIGRATIONS.find((m) => m.id === "0095_account_types")!;
  for (const stmt of migration.sql.split(";").map((s) => s.trim()).filter((s) => s && !s.includes("add column"))) await q.run(stmt);
  const kinds = Object.fromEntries((await q.all<{ handle: string; kind: string | null }>("SELECT handle, kind FROM users")).map((r) => [r.handle, r.kind]));
  assert.deepEqual(kinds, { olddj: "dj", oldproducer: "producer_dj", oldlabel: "label_radio", unset: null });
  await assert.rejects(add("bad", "producer"));
  await add("pro", "music_pro");
  const pro = await q.get<{ kind_note: string; tools: string | null }>("SELECT kind_note, tools FROM users WHERE handle = 'pro'");
  assert.deepEqual({ ...pro }, { kind_note: "", tools: null });
});

test("Label / Radio splits: accounts become Label, switch rules keep their reach, run twice changes nothing", async () => {
  const { q } = await import("../src/lib/db");
  const { readRule, ruleCovers } = await import("../src/lib/switch-rules");
  const migration = (await import("../src/lib/db/migrations")).MIGRATIONS.find((m) => m.id === "0129_split_label_radio")!;
  // The runner's own splitter (src/lib/db/client.ts migrate()).
  const run = async () => {
    for (const stmt of migration.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await q.run(stmt);
  };
  // Rows as the release before wrote them.
  await q.run("ALTER TABLE users DROP CONSTRAINT IF EXISTS users_kind_check");
  const add = (handle: string, kind: string | null) =>
    q.run("INSERT INTO users (email, password_hash, name, handle, plan, kind, created_at) VALUES (?, 'h', ?, ?, 'free', ?, 1)", `${handle}@x.io`, handle, handle, kind);
  await add("splitlabel", "label_radio");
  await add("splitdj", "dj");
  await q.run("INSERT INTO switches (key, on_, updated_at, rule) VALUES ('split_test', 1, 1, ?)", JSON.stringify({ accounts: [], types: ["label_radio"], plans: [], countries: [], percent: 100 }));
  await q.run("INSERT INTO switches (key, on_, updated_at, rule) VALUES ('split_dj', 1, 1, ?)", JSON.stringify({ accounts: [], types: ["dj"], plans: [], countries: [], percent: 100 }));
  await run();
  const rules = async () => Object.fromEntries((await q.all<{ key: string; rule: string }>("SELECT key, rule FROM switches WHERE key LIKE 'split_%'")).map((r) => [r.key, r.rule]));
  const once = await rules();
  await run();
  assert.deepEqual(await rules(), once, "a second run changes nothing");

  const kind = async (h: string) => (await q.get<{ kind: string | null }>("SELECT kind FROM users WHERE handle = ?", h))!.kind;
  assert.equal(await kind("splitlabel"), "label");
  assert.equal(await kind("splitdj"), "dj", "other types untouched");
  await add("splitradio", "radio");
  await add("splitold", "label_radio"); // the release before can still write its id after a rollback
  await assert.rejects(add("splitbad", "producer"));

  assert.equal(once.split_test, JSON.stringify({ accounts: [], types: ["label_radio", "label", "radio"], plans: [], countries: [], percent: 100 }), "label_radio kept, label and radio added, nothing else changed");
  assert.equal(once.split_dj, JSON.stringify({ accounts: [], types: ["dj"], plans: [], countries: [], percent: 100 }), "rules without it untouched");
  const rule = readRule(once.split_test)!;
  assert.deepEqual(rule.types, ["label", "radio"]);
  const who = (kind: "label" | "radio" | "dj") => ({ id: 5, plan: "free", kind });
  assert.equal(ruleCovers("split_test", rule, who("label"), ""), true);
  assert.equal(ruleCovers("split_test", rule, who("radio"), ""), true);
  assert.equal(ruleCovers("split_test", rule, who("dj"), ""), false, "the rule did not widen");
  // The other direction of a rollback: a rule naming only the old id, read by this release, reaches nobody.
  const old = readRule(JSON.stringify({ accounts: [], types: ["label_radio"], plans: [], countries: [], percent: 100 }))!;
  for (const k of ["label", "radio", "dj"] as const) assert.equal(ruleCovers("x", old, who(k), ""), false);
});
