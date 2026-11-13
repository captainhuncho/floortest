import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-site-notices-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// Ops → Notices (Desk, 13 Nov): plain text, a show-from / hide-after window, gated like Announcements, one admin log
// line per change.
const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), "utf8");
const actions = read("../src/app/admin/actions.ts");
const body = (name: string) => actions.slice(actions.indexOf(`export async function ${name}(`)).split("\nexport ")[0];

const H = 3_600_000;
const form = (o: Record<string, unknown>) => (k: string) => o[k];
const base = (t: number) => ({ title: "Short update", detail: "Uploads pause for a few minutes.", href: "", show_from: t, starts_at: t + H, ends_at: t + 2 * H, hide_after: t + 3 * H });

test("a <script> payload stays plain text and the strip prints it as text", async () => {
  const { readNotice } = await import("../src/lib/site-notices");
  const n = readNotice(form({ ...base(1_000), title: "<script>alert(1)</script>", detail: '<img src=x onerror="alert(1)">' }));
  assert.ok(!("error" in n));
  assert.equal(n.title, "<script>alert(1)</script>", "kept as typed, never turned into markup");
  const strip = read("../src/app/dashboard/NoticeStrip.tsx");
  assert.doesNotMatch(strip, /dangerouslySetInnerHTML|innerHTML/);
  assert.match(strip, /\{title\}/, "React prints the title as a text node");
  assert.match(strip, /role="status"/, "a status, not an alert");
  assert.match(strip, /size-11/, "the close button is 44px");
});

test("readNotice refuses what the brief rules out", async () => {
  const { readNotice } = await import("../src/lib/site-notices");
  const t = 1_000;
  const err = (o: Record<string, unknown>) => {
    const r = readNotice(form({ ...base(t), ...o }));
    return "error" in r ? r.error : null;
  };
  assert.equal(err({}), null);
  assert.match(err({ title: "" })!, /title/i);
  assert.match(err({ title: "x".repeat(81) })!, /80/);
  assert.equal(err({ title: "é".repeat(80) }), null, "80 characters, not bytes");
  assert.match(err({ detail: "x".repeat(201) })!, /200/);
  assert.match(err({ title: "Update tonight!" })!, /exclamation/);
  for (const href of ["https://evil.example", "//evil.example", "javascript:alert(1)", "/\\evil.example"]) assert.match(err({ href })!, /page on FloorTest/, href);
  assert.equal(err({ href: "/help" }), null);
  assert.match(err({ show_from: "" })!, /four times/);
  assert.match(err({ show_from: t + 2 * H })!, /Show from/);
  assert.match(err({ ends_at: t + H })!, /end after/);
  assert.match(err({ hide_after: t + H })!, /Hide after/);
  const lines = readNotice(form({ ...base(t), title: "Short\nupdate now" }));
  assert.ok(!("error" in lines) && lines.title === "Short update now", "one line");
});

test("shows only between show-from and hide-after, the soonest first, never once ended", async () => {
  const { q } = await import("../src/lib/db");
  const { createNotice, endNotice, forgetNotices, liveNotice, noticeWindow } = await import("../src/lib/site-notices");
  const t = Date.now();
  const admin = (await q.get<{ id: number }>(
    "INSERT INTO users (email, password_hash, name, handle, plan, tz, created_at, email_verified_at) VALUES ('ops@example.test', 'h', 'Ops', 'ops', 'free', 'UTC', ?, ?) RETURNING id",
    t,
    t,
  ))!.id;
  const later = await createNotice({ ...base(t + 10 * H), title: "Later update" }, admin);
  const soon = await createNotice(base(t + H), admin);
  forgetNotices();
  assert.equal(await liveNotice(t), null, "nothing before show-from");
  forgetNotices();
  assert.equal((await liveNotice(t + H))?.id, soon, "shows from show-from");
  forgetNotices();
  assert.equal((await liveNotice(t + 4 * H - 1))?.id, soon, "still shows just before hide-after");
  forgetNotices();
  assert.equal(await liveNotice(t + 4 * H), null, "gone at hide-after");
  forgetNotices();
  assert.equal((await liveNotice(t + 10 * H))?.id, later);
  assert.equal(await endNotice(later, admin), true);
  assert.equal(await endNotice(later, admin), false, "ending twice changes nothing");
  assert.equal(await liveNotice(t + 10 * H), null, "ending it clears the cache and hides it");
  assert.equal(noticeWindow({ starts_at: Date.UTC(2026, 10, 15, 2, 0), ends_at: Date.UTC(2026, 10, 15, 2, 20) }, "Africa/Accra"), "Sun 15 Nov, 02:00–02:20");
  assert.equal(noticeWindow({ starts_at: Date.UTC(2026, 10, 15, 2, 0), ends_at: Date.UTC(2026, 10, 15, 2, 20) }, "Not/AZone"), "Sun 15 Nov, 02:00–02:20", "a bad zone falls back to UTC");
});

test("only staff with Announcements can open the page or change a notice", async () => {
  const page = read("../src/app/admin/notices/page.tsx");
  assert.match(page, /await requireAdmin\("announcements"\);/);
  const { PAGE_NEEDS, ACTION_NEEDS, ROLE_PERMS } = await import("../src/lib/ops-perms");
  const { can } = await import("../src/lib/ops-access");
  assert.equal(PAGE_NEEDS["/admin/notices"], "announcements");
  assert.equal(ACTION_NEEDS.saveNotice, "announcements");
  assert.equal(ACTION_NEEDS.endNotice, "announcements");
  assert.equal(can({ super: false, role: "support", perms: new Set(ROLE_PERMS.support) }, "announcements"), false, "support is refused");
  for (const name of ["saveNotice", "endNotice"]) {
    assert.match(body(name), /^[^]*?\{\s*const a = await requireAdminAction\("announcements"\);/, `${name} checks first`);
  }
});

test("each change writes one admin log line", () => {
  const save = body("saveNotice");
  assert.equal((save.match(/logAdmin\(/g) ?? []).length, 2, "one in the edit branch, one in the create branch");
  assert.match(save, /logAdmin\(a\.id, "edited notice"/);
  assert.match(save, /logAdmin\(a\.id, "created notice"/);
  assert.match(save, /if \(id\) \{[^]*"edited notice"[^]*\} else \{[^]*"created notice"/, "never both");
  const end = body("endNotice");
  assert.equal((end.match(/logAdmin\(/g) ?? []).length, 1);
  assert.match(end, /logAdmin\(a\.id, "ended notice"/);
});

test("the dashboard reads the notice once per page, never in an admin view", () => {
  const layout = read("../src/app/dashboard/layout.tsx");
  assert.match(layout, /view \? Promise\.resolve\(null\) : liveNotice\(\)/);
  assert.match(layout, /\{!view && siteNotice && \(/);
  const lib = read("../src/lib/site-notices.ts");
  assert.doesNotMatch(lib, /SELECT \*/, "named columns");
});
