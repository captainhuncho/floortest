import { test } from "node:test";
import assert from "node:assert/strict";
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

test("admin audience filters: unknown values become 'any', and the SQL carries only placeholders", async () => {
  const { audienceWhere, readAudience } = await import("../src/lib/audience");
  const form: Record<string, string> = { plan: "' OR 1=1 --", kind: "label' --", tag: "x' OR '1'='1", joined: "7 OR 1=1", activity: "active; DROP TABLE users" };
  const a = readAudience((k) => form[k]);
  assert.deepEqual(a, { plan: "", kind: "", tag: "xor11", joined: 0, activity: "" });
  const w = audienceWhere({ plan: "pro", kind: "label", tag: "beta", joined: 30, activity: "inactive" }, 1_000_000_000_000);
  assert.doesNotMatch(w.sql, /pro|label|beta/, "values travel as bound arguments only");
  assert.equal((w.sql.match(/\?/g) ?? []).length, w.args.length);
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
