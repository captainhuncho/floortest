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

  // The preview counts from emailReach and writes no email SQL of its own.
  const page = src("src/app/admin/announcements/page.tsx");
  assert.match(page, /emailReach\(aud, /);
  assert.match(page, /\{mail\.refused && \(/);
  assert.doesNotMatch(page, /newsletter_subscribers|notify_product|notify_marketing/);
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

test("the users CSV joins repeated filter keys as the pages do, so a doubled filter reads as nobody", async () => {
  const { readAudience } = await import("../src/lib/audience");
  const sp = new URLSearchParams("plan=pro&plan=team");
  assert.equal(readAudience((k) => sp.getAll(k).join(",")).nobody, true);
  assert.equal(readAudience((k) => sp.get(k)).nobody, undefined, "first-value reading would have exported Pro");
  assert.match(src("src/app/api/admin/users-csv/route.ts"), /readAudience\(\(k\) => sp\.getAll\(k\)\.join\(","\)\)/);
});
