import { test } from "node:test";
import assert from "node:assert/strict";
import { testDataDir } from "./test-db";
import { addTags, cleanTagList, sameValue, segmentStep, shownWhileSaving, TAGS_MAX } from "../src/app/admin/kit/core";
import { editableFor, pageList, readLayout, readView, statusOf, usersHref, viewWhere, VIEWS, WEEK_MS } from "../src/app/admin/accounts/crm/model";
import { PERMS, type Perm } from "../src/lib/ops-perms";

// The new Users (admin redesign B, step 5; switch ops_shell): edit in place, saved views in the address, and who may
// change what. The database part runs on a throwaway local copy.
process.env.DATA_DIR = testDataDir("ft-ops-users-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

test("inline tags: commas and spaces trimmed, cleaned the server's way, never an empty or repeated chip (kit fix 3)", () => {
  assert.deepEqual(cleanTagList(", VIP, vip ,, beta , "), ["vip", "vip", "beta"]);
  assert.deepEqual(addTags([], ", VIP, vip ,, beta , "), ["vip", "beta"], "a repeat in any case is one chip");
  assert.deepEqual(addTags(["label"], "Label lead"), ["label", "lead"], "spaces split, like the server");
  assert.deepEqual(addTags(["a"], ","), ["a"], "a lone comma adds nothing");
  assert.deepEqual(addTags([], "beta<script>"), ["betascript"], "only letters, digits and dashes are kept");
  assert.equal(addTags([], "x".repeat(50))[0].length, 30);
  const many = addTags([], Array.from({ length: 30 }, (_, i) => `t${i}`).join(","));
  assert.equal(many.length, TAGS_MAX, "at most 20, like the server");
  const before = ["a"];
  addTags(before, "b");
  assert.deepEqual(before, ["a"], "the list given is never changed");
});

test("a select keeps its old value while the save is pending (kit fix 4); text and tags show the new value at once", () => {
  assert.equal(shownWhileSaving("select", "free", "pro"), "free");
  assert.equal(shownWhileSaving("text", "old note", "new note"), "new note");
  assert.deepEqual(shownWhileSaving("tags", ["a"], ["a", "b"]), ["a", "b"]);
  assert.equal(sameValue(["a", "b"], ["a", "b"]), true);
  assert.equal(sameValue(["a", "b"], ["b", "a"]), false);
  assert.equal(sameValue("x", "x"), true);
});

test("segmented: arrows wrap round, Home and End jump, other keys do nothing", () => {
  assert.equal(segmentStep(0, "ArrowRight", 2), 1);
  assert.equal(segmentStep(1, "ArrowRight", 2), 0);
  assert.equal(segmentStep(0, "ArrowLeft", 3), 2);
  assert.equal(segmentStep(2, "Home", 3), 0);
  assert.equal(segmentStep(0, "End", 3), 2);
  assert.equal(segmentStep(0, "a", 3), null);
});

test("saved views come from ?view=: a fixed list, each with fixed SQL; anything else is All", () => {
  assert.equal(readView("pro"), "pro");
  assert.equal(readView("unconfirmed"), "unconfirmed");
  assert.equal(readView("suspended"), "suspended");
  assert.equal(readView("new"), "new");
  assert.equal(readView(undefined), "all");
  assert.equal(readView("senders"), "all", "Senders stays today's own list");
  assert.equal(readView("pro' OR 1=1 --"), "all");
  assert.equal(readView("toString"), "all", "nothing from the object prototype");
  assert.deepEqual(viewWhere("new", 10 * WEEK_MS), { sql: VIEWS.new.sql, args: [9 * WEEK_MS] });
  assert.deepEqual(viewWhere("pro", 1), { sql: "u.plan = 'pro'", args: [] });
  assert.equal(readLayout("list"), "list");
  assert.equal(readLayout("grid"), "table");
  assert.equal(readLayout(undefined), "table");
});

test("the list's address keeps the view, filters and layout; defaults drop out", () => {
  const p = { kind: "dj", plan: "", tag: "", joined: "", activity: "", security: "on", q: "lena", view: "pro", layout: "list" };
  assert.equal(usersHref(p), "/admin/accounts?kind=dj&security=on&q=lena&view=pro&layout=list");
  assert.equal(usersHref(p, { view: "all", layout: "table", page: "1" }), "/admin/accounts?kind=dj&security=on&q=lena");
  assert.equal(usersHref(p, { page: "3" }), "/admin/accounts?kind=dj&security=on&q=lena&view=pro&layout=list&page=3");
  assert.equal(usersHref({}), "/admin/accounts");
  assert.deepEqual(pageList(5, 20), [1, 0, 4, 5, 6, 0, 20]);
});

test("who may edit what: tags, notes and suspend with Users (support); the plan and the CSV with the super admin only", () => {
  const perms = (...p: Perm[]) => new Set<Perm>(p);
  const support = editableFor({ super: false, perms: perms("users.support") });
  assert.deepEqual(support, { tags: true, note: true, suspend: true, bulk: true, plan: false, csv: false });
  const viewOnly = editableFor({ super: false, perms: perms("users.read") });
  assert.deepEqual(viewOnly, { tags: false, note: false, suspend: false, bulk: false, plan: false, csv: false }, "Users (view) edits nothing");
  const sup = editableFor({ super: true, perms: new Set(Object.keys(PERMS) as Perm[]) });
  assert.deepEqual(sup, { tags: true, note: true, suspend: true, bulk: true, plan: true, csv: true });
  // Even every permission there is, without being the super admin, never edits a plan (it can't be granted).
  const all = editableFor({ super: false, perms: new Set(Object.keys(PERMS) as Perm[]) });
  assert.equal(all.plan, false);
  assert.equal(all.csv, false);
});

test("status: suspended first, then unconfirmed, else active", () => {
  assert.equal(statusOf({ suspended: true, confirmed: false }), "Suspended");
  assert.equal(statusOf({ suspended: false, confirmed: false }), "Unconfirmed");
  assert.equal(statusOf({ suspended: false, confirmed: true }), "Active");
});

test("the rows: views count and filter, the latest note, and search input never widens the list", async () => {
  const { q, now } = await import("../src/lib/db");
  const { crmRows } = await import("../src/app/admin/accounts/crm/data");
  const t = now();
  const add = async (handle: string, o: { plan?: string; verified?: boolean; suspended?: boolean; age?: number } = {}) => {
    await q.run(
      "INSERT INTO users (email, password_hash, name, handle, plan, created_at, email_verified_at, suspended_at) VALUES (?, 'h', ?, ?, ?, ?, ?, ?)",
      `${handle}@x.io`,
      `Name ${handle}`,
      handle,
      o.plan ?? "free",
      t - (o.age ?? 30 * 86_400_000),
      o.verified === false ? null : t,
      o.suspended ? t : null,
    );
    return (await q.get<{ id: number }>("SELECT id FROM users WHERE handle = ?", handle))!.id;
  };
  const pro = await add("upro", { plan: "pro" });
  await add("ufresh", { verified: false, age: 1000 });
  await add("ususp", { suspended: true });
  await q.run("INSERT INTO account_notes (user_id, admin_id, body, created_at) VALUES (?,?,?,?)", pro, pro, "older note", t - 5000);
  await q.run("INSERT INTO account_notes (user_id, admin_id, body, created_at) VALUES (?,?,?,?)", pro, pro, "latest note", t - 10);
  const aud = { plan: "", kind: "", tag: "", joined: 0, activity: "" as const };
  const base = { aud, security: "" as const, search: "", page: 1, at: t, showEmail: true };

  const all = await crmRows({ ...base, view: "all" });
  assert.ok(all.counts.all >= 3);
  assert.equal(all.counts.pro >= 1, true);
  const proRows = await crmRows({ ...base, view: "pro" });
  assert.ok(proRows.rows.every((r) => r.plan === "pro"));
  assert.equal(proRows.rows.find((r) => r.id === pro)?.note, "latest note");
  assert.ok((await crmRows({ ...base, view: "unconfirmed" })).rows.every((r) => r.status === "Unconfirmed"));
  assert.ok((await crmRows({ ...base, view: "suspended" })).rows.every((r) => r.status === "Suspended"));
  const fresh = await crmRows({ ...base, view: "new" });
  assert.ok(fresh.rows.some((r) => r.handle === "ufresh"));
  assert.ok(!fresh.rows.some((r) => r.handle === "upro"), "a month-old account isn't new this week");

  const sneaky = await crmRows({ ...base, view: "all", search: "' OR 1=1 --" });
  assert.equal(sneaky.total, 0, "an injection-shaped search matches nothing");
  const hidden = await crmRows({ ...base, view: "all", showEmail: false });
  assert.ok(hidden.rows.every((r) => r.email === null), "no email when the viewer may not see it");
  assert.deepEqual(Object.keys(all.rows[0]).sort(), ["email", "handle", "id", "joined", "kind", "live", "name", "note", "plan", "status", "tags", "twoFactor"]);
});
