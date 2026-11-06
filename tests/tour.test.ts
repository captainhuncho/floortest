import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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
  // Brand voice (docs/brand-voice.md): no exclamation marks or square brackets, Keep / Not for me, "track" not "song".
  const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
  const words = strings({ TOUR_STEPS, TOUR_FINISH, TOUR_TIPS, TOUR_HABITS }).join("\n");
  assert.doesNotMatch(words, /[![\]]|\bsongs?\b|\bdemos? submission/i);
  for (const h of TOUR_HABITS) if (h.href) assert.match(h.href, /^\/dashboard\//, "habit links stay on the desk");
});

test("the tour opens once per person, never in an admin's view, and closing it marks it seen", async () => {
  const floor = read("../src/app/dashboard/floor/page.tsx");
  assert.match(floor, /const tourDue = !view && !\(await q\.get<\{ t: number \| null \}>\("SELECT tour_seen_at AS t FROM users WHERE id = \?", user\.actor_id\)\)\?\.t;/);
  assert.match(floor, /\{tourDue && <FirstVisitTour tip=\{tourTip\(user\.kind\)\} \/>\}/);
  const desk = read("../src/app/dashboard/actions/desk.ts");
  const fn = desk.slice(desk.indexOf("export async function markTourSeen(")).split("\nexport ")[0];
  assert.match(fn, /const me = await requirePerson\(\);\s*await q\.run\("UPDATE users SET tour_seen_at = \? WHERE id = \? AND tour_seen_at IS NULL", now\(\), me\.id\);/, "the signed-in person's own row only");
  assert.match(read("../scripts/check-desk-roles.ts"), /markTourSeen: "person"/);
  const tour = read("../src/app/dashboard/Tour.tsx");
  assert.match(tour, /onClose=\{\(\) => \{\s*setOpen\(false\);\s*void markTourSeen\(\);/, "any close (X, Escape, Skip, finish) marks it seen");
  assert.match(read("../src/app/dashboard/Sidebar.tsx"), /href: "\/dashboard\/how-it-works", label: "How it works"/);
  assert.match(read("../src/app/dashboard/account/page.tsx"), /<Row href="\/dashboard\/how-it-works"/);
});

test("0133: accounts from before see no pop-up; new accounts get it once", async () => {
  const { q } = await import("../src/lib/db");
  const migration = (await import("../src/lib/db/migrations")).MIGRATIONS.find((m) => m.id === "0133_tour_seen")!;
  await q.run("INSERT INTO users (email, password_hash, name, handle, created_at) VALUES ('old@x.io', 'h', 'old', 'oldtour', 1)");
  await q.run("UPDATE users SET tour_seen_at = NULL");
  for (const stmt of migration.sql.split(/;\s*\n/).map((s) => s.trim()).filter(Boolean)) await q.run(stmt);
  assert.ok((await q.get<{ t: number | null }>("SELECT tour_seen_at AS t FROM users WHERE handle = 'oldtour'"))!.t, "existing account marked seen");
  await q.run("INSERT INTO users (email, password_hash, name, handle, created_at) VALUES ('new@x.io', 'h', 'new', 'newtour', 2)");
  assert.equal((await q.get<{ t: number | null }>("SELECT tour_seen_at AS t FROM users WHERE handle = 'newtour'"))!.t, null, "a new account sees the tour");
});
