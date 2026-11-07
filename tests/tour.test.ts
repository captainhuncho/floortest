import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { testDataDir } from "./test-db";

// A throwaway local database for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-tour-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

const read = (f: string) => fs.readFileSync(new URL(f, import.meta.url), "utf8");

test("the tour: five steps with a real picture each, ending on Share your link, and a tip for every account type", async () => {
  const { TOUR_STEPS, TOUR_FINISH, TOUR_TIPS, TOUR_HABITS, tourTip } = await import("../src/lib/tour");
  const { ACCOUNT_TYPES } = await import("../src/lib/account-types");
  assert.deepEqual(TOUR_STEPS.map((s) => s.id), ["link", "floor", "queue", "collections", "prepare"]);
  for (const s of TOUR_STEPS) {
    assert.ok(fs.existsSync(new URL(`../public${s.image}`, import.meta.url)), `${s.image} exists`);
    assert.match(s.image, /\.webp$/, "WebP");
    assert.ok(s.alt.length > 10, `${s.id} has alt text`);
  }
  assert.equal(TOUR_FINISH.title, "Share your link");
  assert.deepEqual(Object.keys(TOUR_TIPS).sort(), Object.keys(ACCOUNT_TYPES).sort(), "one tip per account type, no more");
  assert.equal(tourTip("label_radio"), null, "an old or unknown type gets no tip");
  assert.equal(tourTip(null), null);
  assert.equal(tourTip("constructor"), null);
  // Owner, 6 Nov: never the owner's link; any link in the tour reads exactly floortest.app/username. The words carry no
  // link at all, and the pictures (demo data, link checked by eye) are pinned, so a new picture needs a fresh look first.
  assert.doesNotMatch(JSON.stringify({ TOUR_STEPS, TOUR_FINISH, TOUR_TIPS, TOUR_HABITS }), /floortest\.app\//i);
  const pinned: Record<string, string> = {
    link: "adac49d03de0271c7a537c0ec7d88b80a941b8af5e1907442076c8053ebc8472",
    floor: "d5643458b585e1175c14d0db953406da4a05be217b3fa527368892c6a99994e3",
    queue: "8f40e1da7a424d66d2cf4e9c752f56a5fd1375007fdec15031655dd993dd27d9",
    collections: "ce91a1be41259a9ab54236e5d85742082137ddaabe67266fde5ea355f4dccbca",
    prepare: "c1f13fd3157a276d462b5297e9cbc2f7608356331d75c07d178586bf624b2850",
  };
  for (const s of TOUR_STEPS) {
    const sha = createHash("sha256").update(fs.readFileSync(new URL(`../public${s.image}`, import.meta.url))).digest("hex");
    assert.equal(sha, pinned[s.id], `${s.image} is the checked picture`);
  }
  // Brand voice (docs/brand-voice.md): no exclamation marks or square brackets, Keep / Not for me, "track" not "song".
  const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
  const words = strings({ TOUR_STEPS, TOUR_FINISH, TOUR_TIPS, TOUR_HABITS }).join("\n");
  assert.doesNotMatch(words, /[![\]]|\bsongs?\b|\bdemos? submission/i);
  for (const h of TOUR_HABITS) if (h.href) assert.match(h.href, /^\/dashboard\//, "habit links stay on the desk");
});

test("the tour opens once per person, never in an admin's view, and closing it marks it seen", async () => {
  const floor = read("../src/app/dashboard/floor/page.tsx");
  assert.match(floor, /q\.get<\{ t: number \| null \}>\("SELECT tour_seen_at AS t FROM users WHERE id = \?", user\.actor_id\)\.catch\(\(\) => \(\{ t: 1 \}\)\),\n  \]\);/, "the person's own row, read with the rest; a failed read counts as seen");
  assert.match(floor, /const tourDue = !view && !tourSeen\?\.t;/);
  assert.match(floor, /\{tourDue && <FirstVisitTour tip=\{tourTip\(user\.kind\)\} \/>\}/);
  const desk = read("../src/app/dashboard/actions/desk.ts");
  const fn = desk.slice(desk.indexOf("export async function markTourSeen(")).split("\nexport ")[0];
  assert.match(fn, /^[^]*?\{\s*(\/\/[^\n]*\n\s*)*const me = await requirePerson\(\);\s*await markTourSeenFor\(me\.id\);\s*\}/, "the signed-in person, never the desk, and nothing else");
  // requirePerson: the person behind the session; in an admin's read-only view there is none, so it redirects first.
  const auth = read("../src/lib/auth.ts");
  const person = auth.slice(auth.indexOf("export async function requirePerson(")).split("\nexport ")[0];
  assert.match(person, /const u = await currentPerson\(\);\s*if \(!u && \(await viewingAs\(\)\)\) redirect\(/, "view-as redirects before anything is written");
  assert.match(read("../src/app/dashboard/how-it-works/page.tsx"), /export default async function HowItWorks\(\) \{\s*const user = await requireUser\(\);/, "the page needs a signed-in desk");
  assert.match(read("../scripts/check-desk-roles.ts"), /markTourSeen: "person"/);
  const tour = read("../src/app/dashboard/Tour.tsx");
  assert.match(tour, /onClose=\{\(\) => \{\s*setOpen\(false\);[^]*?markTourSeen\(\)\.catch\(\(\) => undefined\);/, "any close (X, Escape, Skip, finish) marks it seen, and a failed save never throws");
  assert.match(read("../src/app/dashboard/Sidebar.tsx"), /href: "\/dashboard\/how-it-works", label: "How it works"/);
  assert.match(read("../src/app/dashboard/account/page.tsx"), /<Row href="\/dashboard\/how-it-works"/);
});

test("0135: accounts from before see no pop-up; new accounts get it once", async () => {
  const { q } = await import("../src/lib/db");
  const migration = (await import("../src/lib/db/migrations")).MIGRATIONS.find((m) => m.id === "0135_tour_seen")!;
  await q.run("INSERT INTO users (email, password_hash, name, handle, created_at) VALUES ('old@x.io', 'h', 'old', 'oldtour', 1)");
  await q.run("UPDATE users SET tour_seen_at = NULL");
  for (const stmt of migration.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await q.run(stmt);
  assert.ok((await q.get<{ t: number | null }>("SELECT tour_seen_at AS t FROM users WHERE handle = 'oldtour'"))!.t, "existing account marked seen");
  await q.run("INSERT INTO users (email, password_hash, name, handle, created_at) VALUES ('new@x.io', 'h', 'new', 'newtour', 2)");
  assert.equal((await q.get<{ t: number | null }>("SELECT tour_seen_at AS t FROM users WHERE handle = 'newtour'"))!.t, null, "a new account sees the tour");
});

test("marking the tour seen changes only the person's own row, not the team desk they work on or anyone else", async () => {
  const { q } = await import("../src/lib/db");
  const { markTourSeenFor } = await import("../src/lib/tour-seen");
  const add = async (handle: string) => (await q.get<{ id: number }>("INSERT INTO users (email, password_hash, name, handle, created_at) VALUES (?, 'h', ?, ?, 3) RETURNING id", `${handle}@x.io`, handle, handle))!.id;
  const a = await add("tourpersona");
  const b = await add("tourpersonb");
  const desk = await add("tourteamdesk");
  await q.run("INSERT INTO account_members (account_id, user_id, role, created_at) VALUES (?, ?, 'member', 3)", desk, a);
  const seen = async (id: number) => (await q.get<{ t: number | null }>("SELECT tour_seen_at AS t FROM users WHERE id = ?", id))!.t;
  await markTourSeenFor(a);
  const first = await seen(a);
  assert.ok(first, "A marked");
  assert.equal(await seen(desk), null, "the team desk A works on stays unmarked");
  assert.equal(await seen(b), null, "B stays unmarked");
  // A fixed earlier time, so the check below can't pass by both closes landing in the same millisecond.
  await q.run("UPDATE users SET tour_seen_at = 1000 WHERE id = ?", a);
  await markTourSeenFor(a);
  assert.equal(await seen(a), 1000, "a second close keeps the first time");
});
