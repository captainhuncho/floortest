import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// Rule 1 (audit 27 Oct; owner's SQL rule, 24 Oct): sort and filter values from the address only pick from fixed lists,
// and search text is always a bound value with its wildcards escaped. A throwaway local database for the search check.
process.env.DATA_DIR = testDataDir("ft-sql-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

const HOSTILE = ["' OR 1=1 --", "1; DROP TABLE tracks", "name DESC", "lower(s.name) ASC", "__proto__", "constructor", "", "ALL", "Kept"];

test("contacts sort and filter, review status: anything off the list falls back, and no request text reaches the SQL", async () => {
  const { pickShow, pickSort, SHOWS, SORTS } = await import("../src/app/dashboard/contacts/filters");
  const { pickStatus, TRACK_STATUSES } = await import("../src/lib/statuses");
  for (const v of [...HOSTILE, undefined]) {
    assert.equal(pickSort(v), SORTS[0], `sort ${v}`);
    assert.equal(pickShow(v), SHOWS[0], `show ${v}`);
    assert.equal(pickStatus(v), "review", `status ${v}`);
  }
  assert.equal(pickSort("name")[2], "lower(s.name) ASC");
  assert.equal(pickShow("blocked")[2], "s.blocked_at IS NOT NULL");
  assert.equal(pickStatus("kept"), "kept");
  // The SQL pieces are the fixed ones, whatever was asked for.
  const fixed = new Set([...SORTS, ...SHOWS, ...TRACK_STATUSES].map((r) => r[2]));
  for (const v of HOSTILE) for (const sql of [pickSort(v)[2], pickShow(v)[2]]) assert.ok(fixed.has(sql), sql);
});

test("admin audience filters: values that can't be read match nobody, and the SQL carries only placeholders", async () => {
  const { audienceWhere, readAudience } = await import("../src/lib/audience");
  const form: Record<string, string> = { plan: "' OR 1=1 --", kind: "label' --", tag: "x' OR '1'='1", joined: "7 OR 1=1", activity: "active; DROP TABLE users" };
  const a = readAudience((k) => form[k]);
  assert.deepEqual(a, { plan: "", kind: "unknown", tag: "", joined: 0, activity: "", nobody: true });
  assert.match(audienceWhere(a).sql, /\bFALSE\b/);
  const w = audienceWhere({ plan: "pro", kind: "label", tag: "beta", joined: 30, activity: "inactive" }, 1_000_000_000_000);
  assert.doesNotMatch(w.sql, /pro|label|beta/, "values travel as bound arguments only");
  assert.equal((w.sql.match(/\?/g) ?? []).length, w.args.length);
});

test("an announcement or list filter for a type that doesn't exist reaches nobody, never everyone", async () => {
  const { audienceWhere, readAudience, describeAudience } = await import("../src/lib/audience");
  const { q } = await import("../src/lib/db");
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, kind, created_at) VALUES ('aud@x.io', 'h', 'aud', 'aud', 'free', 'dj', 1)");
  const count = async (kind: string) => {
    const w = audienceWhere(readAudience((k) => ({ kind })[k]));
    return Number((await q.get<{ n: number }>(`SELECT count(*) AS n FROM users u WHERE ${w.sql}`, ...w.args))!.n);
  };
  assert.ok((await count("")) >= 1, "no type picked is everyone");
  assert.equal(await count("dj"), 1);
  for (const stale of ["label_radio", "constructor", "toString"]) assert.equal(await count(stale), 0, `${stale} reaches nobody`);
  assert.equal(describeAudience(readAudience((k) => ({ kind: "label_radio" })[k])), "Unknown type (nobody)");

  // The other filters fail closed the same way: a value that can't be read reaches nobody, never everyone.
  const reach = async (f: Record<string, string>) => {
    const w = audienceWhere(readAudience((k) => f[k]));
    return Number((await q.get<{ n: number }>(`SELECT count(*) AS n FROM users u WHERE ${w.sql}`, ...w.args))!.n);
  };
  assert.ok((await reach({ plan: "", tag: "", joined: "0", activity: "" })) >= 1, "the form's own empty values are everyone");
  for (const f of [{ plan: "Not A Plan" }, { tag: "!!!" }, { joined: "5" }, { joined: "constructor" }, { activity: "all" }, { nobody: "1" }, { nobody: "true", plan: "pro" }] as Record<string, string>[])
    assert.equal(await reach(f), 0, `${JSON.stringify(f)} reaches nobody`);
  assert.equal(describeAudience(readAudience((k) => ({ joined: "5" })[k])), "Unreadable filter (nobody)");

  // Links and forms carry the filters as sent, and the server reads them again: the unreadable stay unreadable, and a
  // made-up flag in a link decides nothing.
  const { audienceQuery } = await import("../src/lib/audience");
  for (const f of [{ plan: "Not A Plan" }, { kind: "label_radio" }, { tag: "!!!" }, { joined: "5" }, { activity: "all" }, { plan: "pro", tag: "Beta-1", joined: "30" },
    // Padded and over-long values: the preview and the publish must read the same, never a cut-down filter.
    { plan: `pro${" ".repeat(97)}x` }, { kind: `dj${" ".repeat(98)}` + "x" }, { joined: `30${" ".repeat(98)}x` }, { activity: `active${" ".repeat(94)}x` },
    { plan: "p".repeat(101) }, { tag: `${"!".repeat(95)}abcdefghij` }, { tag: "a".repeat(31) }, { tag: `beta${" ".repeat(200)}` },
    // nobody travels on, alone or with readable filters.
    { nobody: "1", plan: "pro" }, { nobody: "true" }] as Record<string, string>[]) {
    const again = audienceQuery((k) => f[k]);
    assert.deepEqual(readAudience((k) => again[k as keyof typeof again]), readAudience((k) => f[k]), JSON.stringify(f));
  }
  for (const f of [{ plan: `pro${" ".repeat(97)}x` }, { plan: "p".repeat(101) }, { tag: "a".repeat(31) }] as Record<string, string>[])
    assert.equal(readAudience((k) => f[k]).nobody, true, `${JSON.stringify(f).slice(0, 40)}: over the limit reaches nobody`);
  // A tag is read only as typed: anything stripped could match a different tag.
  for (const tag of [`${"!".repeat(95)}abc`, `${"!".repeat(95)}abcdefghij`, "Béta", "a,b", "beta 1", "x' OR '1'='1"])
    assert.equal(readAudience((k) => ({ tag })[k]).nobody, true, tag.slice(-12));
  assert.deepEqual(readAudience((k) => ({ tag: "Beta-1" })[k]), { plan: "", kind: "", tag: "beta-1", joined: 0, activity: "" }, "case aside, as typed");
  for (const f of [{ nobody: "1", plan: "pro" }, { joined: "5" }, { kind: "label_radio" }] as Record<string, string>[])
    assert.equal(audienceQuery((k) => f[k]).nobody, "1", `${JSON.stringify(f)}: nobody=1 travels on`);
  assert.equal(audienceQuery((k) => ({ plan: "pro" })[k as "plan"]).nobody, "", "a readable filter carries no nobody");

  // Newsletter subscribers join only an audience of Everyone.
  const { audienceIsEveryone } = await import("../src/lib/audience");
  assert.equal(audienceIsEveryone(readAudience((k) => ({ joined: "0" })[k])), true, "the form's own empty values");
  for (const f of [{ plan: "pro" }, { kind: "dj" }, { tag: "beta" }, { joined: "30" }, { activity: "active" }, { joined: "5" }, { kind: "label_radio" }] as Record<string, string>[])
    assert.equal(audienceIsEveryone(readAudience((k) => f[k])), false, JSON.stringify(f));
});

test("admin pages pass the filters on as sent, and an unreadable audience is never published", () => {
  const read = (f: string) => fs.readFileSync(new URL(f, import.meta.url), "utf8");
  const users = read("../src/app/admin/accounts/page.tsx");
  assert.match(users, /const params = \{ \.\.\.audienceQuery\(\(k\) => sp\[k\]\), security, q: search \};/, "Users: pager links");
  assert.match(users, /const csv = new URLSearchParams\(Object\.entries\(params\)/, "Users: CSV link");
  const crm = read("../src/app/admin/accounts/crm/CrmUsers.tsx");
  assert.match(crm, /const audParams = audienceQuery\(\(k\) => sp\[k\]\);\s*const params: Record<string, string> = \{ \.\.\.audParams,/, "CRM: pager links");
  assert.match(crm, /const csv = new URLSearchParams\(Object\.entries\(\{ \.\.\.audParams,/, "CRM: CSV link");
  assert.match(read("../src/app/admin/announcements/page.tsx"), /Object\.entries\(\{ \.\.\.draft, \.\.\.audienceQuery\(\(k\) => sp\[k\]\) \}\)/, "publish form");
  assert.match(read("../src/app/admin/AudienceFields.tsx"), /\{\(a\.nobody \|\| a\.kind === UNKNOWN_KIND\) && \(\s*<p role="alert"/, "the form says the filter can't be read");
  // Backstop for the behaviour test below: the action checks the admin, then saves through saveAnnouncement and
  // returns its refusal before any mail is queued.
  const actions = read("../src/app/admin/actions.ts");
  const publish = actions.slice(actions.indexOf("export async function publishAnnouncement(")).split("\nexport ")[0];
  assert.match(publish, /^[^]*?\{\s*const a = await requireAdminAction\("announcements"\);[^]*?const saved = await saveAnnouncement\(a\.id, \(k\) => form\.get\(k\)\);\s*if \("error" in saved\) return fail\(saved\.error\);/);
  assert.ok(publish.indexOf("sendMail(") > publish.indexOf('if ("error" in saved)'), "refused before any mail");
  const lib = read("../src/lib/announce.ts");
  const refuse = lib.indexOf("if (aud.nobody || aud.kind === UNKNOWN_KIND) return { error:");
  const everyone = lib.indexOf("if (reach.refused) return { error:");
  assert.ok(refuse > 0 && everyone > 0);
  for (const later of ["INSERT INTO announcements", "announcement_recipients", "newsletter_subscribers"])
    assert.ok(lib.indexOf(later) > Math.max(refuse, everyone), `refused before ${later}`);

});

test("search text: % and _ are literal, and an injection attempt finds nothing extra", async () => {
  const { likeContains, q } = await import("../src/lib/db");
  assert.equal(likeContains("50%_off"), "%50\\%\\_off%");
  assert.equal(likeContains("a\\b"), "%a\\\\b%");
  const rows = async (search: string) =>
    (await q.all<{ x: string }>("SELECT x FROM (VALUES ('50% off'), ('a_b'), ('axb'), ('other')) AS v(x) WHERE x ILIKE ? ORDER BY x", likeContains(search))).map((r) => r.x);
  assert.deepEqual(await rows("%"), ["50% off"], "% matches only a real percent sign");
  assert.deepEqual(await rows("_"), ["a_b"], "_ matches only a real underscore");
  assert.deepEqual(await rows("' OR 1=1 --"), []);
  assert.deepEqual(await rows("' OR 'x'='x"), []);
});

test("publishing: an unreadable audience, or subscribers with a narrowed one, writes nothing and emails nobody", async () => {
  const { saveAnnouncement } = await import("../src/lib/announce");
  const { q } = await import("../src/lib/db");
  await q.run("INSERT INTO users (email, password_hash, name, handle, plan, kind, created_at, notify_product, email_verified_at) VALUES ('pub@x.io', 'h', 'pub', 'pub', 'pro', 'dj', 1, 1, 1)");
  await q.run("INSERT INTO newsletter_subscribers (email, token, created_at, confirmed_at) VALUES ('sub@x.io', 'tok-pub', 1, 1)");
  const rows = async () => ({
    announcements: await q.count("SELECT COUNT(*) AS n FROM announcements"),
    recipients: await q.count("SELECT COUNT(*) AS n FROM announcement_recipients"),
    outbox: await q.count("SELECT COUNT(*) AS n FROM outbox"),
  });
  const before = await rows();
  const save = (f: Record<string, string>) => saveAnnouncement(1, (k) => ({ title: "Hello", list: "product", subscribers: "on", ...f })[k] ?? null);
  for (const [f, why] of [
    [{ plan: "Not A Plan" }, /can't be read/],
    [{ kind: "label_radio" }, /can't be read/],
    [{ joined: "5" }, /can't be read/],
    [{ nobody: "true" }, /can't be read/],
    [{ plan: `pro${" ".repeat(97)}x` }, /can't be read/],
    [{ plan: "pro" }, /only be included when the audience is Everyone/],
    [{ kind: "dj" }, /only be included when the audience is Everyone/],
  ] as [Record<string, string>, RegExp][]) {
    const r = await save(f);
    assert.match("error" in r ? r.error : "saved", why, JSON.stringify(f).slice(0, 40));
  }
  assert.deepEqual(await rows(), before, "nothing written, nothing queued");

  // Through the page's hidden fields (the preview's query, passed on as the publish form): nobody is never lost.
  const { audienceQuery } = await import("../src/lib/audience");
  for (const sp of [{ nobody: "1" }, { nobody: "1", plan: "pro" }, { nobody: "true" }, { plan: "Not A Plan" }, { tag: "beta 1" }] as Record<string, string>[]) {
    const draft = { title: "Hello", list: "product", subscribers: "on" };
    const fields: Record<string, string> = { ...draft, ...audienceQuery((k) => sp[k]) };
    const r = await saveAnnouncement(1, (k) => fields[k] ?? null);
    assert.match("error" in r ? r.error : "saved", /can't be read/, JSON.stringify(sp));
  }
  assert.deepEqual(await rows(), before, "still nothing written, nothing queued");

  // Everyone: the subscriber is included; a narrowed audience without subscribers still publishes to it.
  const all = await save({});
  assert.ok("id" in all && all.subscribers.some((s) => s.email === "sub@x.io") && all.people.some((p) => p.email === "pub@x.io"));
  const pro = await save({ plan: "pro", subscribers: "" });
  assert.ok("id" in pro && pro.subscribers.length === 0 && pro.people.some((p) => p.email === "pub@x.io"));
  assert.equal((await rows()).outbox, before.outbox, "saving queues no mail; the action sends after it returns");
});
