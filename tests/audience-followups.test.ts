import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { testDataDir } from "./test-db";
import { failOnce } from "./fail-once";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-audience-followups-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;
delete process.env.RESEND_API_KEY;

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const form = (o: Record<string, string>) => (k: string) => o[k];

test("an announcement whose bell recipients can't be written leaves no announcement behind", async () => {
  const { q } = await import("../src/lib/db");
  const { saveAnnouncement } = await import("../src/lib/announce");
  const admin = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, created_at) VALUES ('boss@x.io', 'h', 'Boss', 'boss', 'free', 1) RETURNING id",
  ))!.id;
  const before = await q.count("SELECT COUNT(*) AS n FROM announcements");
  const restore = failOnce(q as never, /INSERT INTO announcement_recipients/);
  try {
    await assert.rejects(saveAnnouncement(admin, form({ title: "Rolled back" })));
  } finally {
    restore();
  }
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM announcements"), before, "the announcement row went with its recipients");
  const ok = await saveAnnouncement(admin, form({ title: "Goes out" }));
  assert.ok(!("error" in ok), "the next one saves");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM announcements"), before + 1);
});

test("the preview and the publish read one email reach: same subscriber gate, same 5000 cap", async () => {
  const { emailReach, EMAIL_CAP, saveAnnouncement } = await import("../src/lib/announce");
  const { readAudience } = await import("../src/lib/audience");
  const everyone = readAudience(form({}));
  const pros = readAudience(form({ plan: "pro" }));
  assert.equal(EMAIL_CAP, 5000);

  const all = emailReach(everyone, "product", true);
  assert.equal(all.refused, false);
  assert.match(all.people!.sql, /LIMIT 5000$/);
  assert.match(all.subscribers!, /LIMIT 5000$/);
  assert.match(emailReach(everyone, "marketing", true).subscribers!, /s\.marketing = 1/, "offers go only to subscribers who took offers");

  const filtered = emailReach(pros, "product", true);
  assert.equal(filtered.refused, true, "subscribers with a filter set: refused");
  assert.equal(filtered.subscribers, null);
  assert.equal(emailReach(pros, "product", false).refused, false);
  assert.equal(emailReach(everyone, null, true).people, null, "bell only emails nobody");
  assert.equal(emailReach(everyone, null, true).subscribers, null);
  assert.equal(emailReach(everyone, null, true).refused, false);

  const refused = await saveAnnouncement(1, form({ title: "x", list: "product", subscribers: "on", plan: "pro" }));
  assert.deepEqual(refused, { error: "Newsletter subscribers can only be included when the audience is Everyone." });

});

test("the preview's email count is the number the publish emails, for the same audience", async () => {
  const { q } = await import("../src/lib/db");
  const { emailReach, saveAnnouncement } = await import("../src/lib/announce");
  const { audienceWhere, readAudience } = await import("../src/lib/audience");
  const add = (h: string, plan: string, product: number, verified: boolean) =>
    q.run(
      "INSERT INTO users (email, password_hash, name, handle, plan, notify_product, email_verified_at, created_at) VALUES (?,?,?,?,?,?,?,1)",
      `${h}@x.io`, "h", h, h, plan, product, verified ? 1 : null,
    );
  await add("pro-in", "pro", 1, true);
  await add("pro-in2", "pro", 1, true);
  await add("pro-optout", "pro", 0, true);
  await add("pro-unverified", "pro", 1, false);
  await add("team-in", "team", 1, true);
  const admin = (await q.get<{ id: number }>("SELECT id FROM users WHERE handle = 'pro-in'"))!.id;

  const draft = { title: "Pro news", list: "product", plan: "pro" };
  // As the preview page counts it.
  const at = Date.now();
  const aud = readAudience(form(draft));
  const mail = emailReach(aud, "product", false, at);
  const previewEmails = await q.count(`SELECT COUNT(*) AS n FROM (${mail.people!.sql}) x`, ...mail.people!.args);
  const w = audienceWhere(aud, at);
  const previewBell = await q.count(`SELECT COUNT(*) AS n FROM users u WHERE ${w.sql}`, ...w.args);
  // As the publish picks them.
  const saved = await saveAnnouncement(admin, form(draft));
  assert.ok(!("error" in saved));
  assert.equal(saved.people.length, previewEmails, "emails the number the preview showed");
  assert.deepEqual(saved.people.map((p) => p.email).sort(), ["pro-in2@x.io", "pro-in@x.io"], "only opted-in, confirmed Pro accounts");
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM announcement_recipients WHERE announcement_id = ?", saved.id), previewBell, "the bell reaches the number the preview showed");
});

test("a tag is checked as typed, before lowercasing", async () => {
  const { readAudience } = await import("../src/lib/audience");
  const kelvin = readAudience(form({ tag: "Key" })); // KELVIN SIGN lowercases to an ASCII k
  assert.equal(kelvin.tag, "");
  assert.equal(kelvin.nobody, true);
  assert.equal(readAudience(form({ tag: "Beta-1" })).tag, "beta-1");
  assert.equal(readAudience(form({ tag: "Beta-1" })).nobody, undefined);
});

test("Clear all and the unreadable chip clear nobody; the Type chip drops nobody when an unknown type was its only cause", async () => {
  const { AUDIENCE_CLEARED, audienceIsEveryone, kindOff, readAudience } = await import("../src/lib/audience");
  const messy = { plan: "BAD!", kind: "wizard", tag: "x y", joined: "3", activity: "sleepy", nobody: "1" };
  const cleared: Record<string, string> = { ...messy, ...AUDIENCE_CLEARED };
  assert.equal(audienceIsEveryone(readAudience(form(cleared))), true, "every audience field and nobody are cleared");

  // An unknown type, carried on through paging with nobody=1: taking the Type chip off reaches people again.
  const unknownOnly = { kind: "wizard", nobody: "1", plan: "pro" };
  assert.deepEqual(kindOff(form(unknownOnly)), { kind: "", nobody: "" });
  assert.equal(readAudience(form({ ...unknownOnly, ...kindOff(form(unknownOnly)) })).nobody, undefined);
  // Another filter still can't be read: nobody stays.
  assert.deepEqual(kindOff(form({ kind: "wizard", nobody: "1", plan: "BAD!" })), { kind: "", nobody: "1" });

  for (const p of ["src/app/admin/accounts/page.tsx", "src/app/admin/accounts/crm/CrmUsers.tsx"]) {
    const s = src(p);
    assert.match(s, /label: "Filter", value: "Unreadable \(nobody\)", off: link\(\{ \.\.\.AUDIENCE_CLEARED, page: "" \}\)/, p);
    assert.match(s, /label: "Type", value: kindLabel\(aud\.kind\), off: link\(\{ \.\.\.kindOff\(\(k\) => sp\[k\]\), page: "" \}\)/, p);
    assert.match(s, /link\(\{ \.\.\.AUDIENCE_CLEARED, security: "", page: "" \}\)/, `${p}: Clear all`);
  }
});

test("the users CSV reads ?plan=pro&plan=team as nobody and selects no rows", async () => {
  const { q } = await import("../src/lib/db");
  const { audienceWhere, readAudience, readJoined } = await import("../src/lib/audience");
  const rows = async (query: string) => {
    const w = audienceWhere(readAudience(readJoined(new URLSearchParams(query))), Date.now(), true);
    return q.count(`SELECT COUNT(*) AS n FROM users u WHERE ${w.sql}`, ...w.args);
  };
  assert.ok((await rows("plan=pro")) > 0, "Pro accounts exist to export");
  assert.equal(await rows("plan=pro&plan=team"), 0, "a doubled filter exports nobody, not the first value");
  // A doubled Security filter is refused (400, no file), never read as "no filter", which would export every account.
  const { securityUnreadable } = await import("../src/lib/admin-bulk");
  const sp = new URLSearchParams("security=on&security=off&q=a&q=b");
  assert.equal(securityUnreadable(readJoined(sp)("security")), true, "?security=on&security=off exports nothing");
  for (const ok of ["", "on", "off"]) assert.equal(securityUnreadable(ok), false, `"${ok}" exports as before`);
  assert.equal(readJoined(sp)("q"), "a,b", "a doubled search is a literal search, so it can only narrow");
});

test("publishing with a doubled filter in the form is refused and writes nothing", async () => {
  const { q } = await import("../src/lib/db");
  const { saveAnnouncement } = await import("../src/lib/announce");
  const { readJoined } = await import("../src/lib/audience");
  const fd = new FormData();
  fd.set("title", "Doubled");
  fd.append("plan", "pro");
  fd.append("plan", "team");
  const before = await q.count("SELECT COUNT(*) AS n FROM announcements");
  assert.deepEqual(await saveAnnouncement(1, readJoined(fd)), { error: "This audience can't be read. Pick it again." });
  assert.equal(await q.count("SELECT COUNT(*) AS n FROM announcements"), before);
});
