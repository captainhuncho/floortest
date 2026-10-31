import assert from "node:assert/strict";
import { test } from "node:test";
import type { Plan } from "../src/lib/plan-store";
import { addsOver, bestSaving, hasYearly, liftedId, saving } from "../src/app/dashboard/plans/plan-lines";
import { compareRows } from "../src/app/dashboard/plans/PlanCompare";

const GB = 1024 ** 3;
const plan = (p: Partial<Plan> & Pick<Plan, "id" | "price">): Plan => ({
  name: p.id,
  yearly: 0,
  limit: 20,
  blurb: "",
  features: [],
  trackArt: false,
  featured: false,
  position: 0,
  retired: false,
  seats: 1,
  folderBytes: 0,
  discount: { pct: 0, label: "", endsAt: null },
  ...p,
});
const free = plan({ id: "free", price: 0, features: ["20 active tracks"] });
const pro = plan({ id: "pro", price: 6.99, yearly: 77.99, limit: 500, folderBytes: GB, featured: true, features: ["500 active tracks", "Everything in Free"] });
const team = plan({ id: "team", price: 12.99, yearly: 144.99, limit: 2000, folderBytes: 3 * GB, trackArt: true, seats: 3, features: ["Share with a teammate", "Priority email help"] });
const live = { sharing: false, teams: false };

test("yearly saving is rounded down and the best one is reported", () => {
  assert.equal(saving(pro), 7);
  assert.equal(saving(team), 6);
  assert.equal(saving(free), 0);
  assert.equal(bestSaving([free, pro, team]), 7);
});

test("the billing switch only appears when a paid plan has a yearly price", () => {
  assert.equal(hasYearly([free, pro]), true);
  assert.equal(hasYearly([free, { ...pro, yearly: 0 }]), false);
});

test("the featured plan is lifted, or the first when none is", () => {
  assert.equal(liftedId([free, pro, team]), "pro");
  assert.equal(liftedId([free, { ...pro, featured: false }]), "free");
});

test("a card lists only what it adds over the plan before it, and nothing held back", () => {
  assert.deepEqual(addsOver(pro, free, live), ["Send folders (EP or album) up to 1 GB"]);
  assert.deepEqual(addsOver(team, pro, live), ["Send folders (EP or album) up to 3 GB", "Track artwork from senders", "Priority email help"]);
  assert.ok(addsOver(team, pro, { sharing: true, teams: true }).some((f) => f.startsWith("3 people")));
});

test("the comparison table is built from plan data only", () => {
  const rows = compareRows([free, pro, team], { billing: false, prices: true, live });
  const row = (label: string) => rows.find((r) => r.label === label)?.cells;
  assert.deepEqual(row("Monthly price"), ["$0", "$6.99", "$12.99"]);
  assert.deepEqual(row("Yearly price"), ["$0", "$77.99", "$144.99"]);
  assert.deepEqual(row("Active tracks"), ["20", "500", "2,000"]);
  assert.deepEqual(row("Send folders (EP or album)"), [false, "Up to 1 GB", "Up to 3 GB"]);
  assert.deepEqual(row("Track artwork from senders"), [false, false, true]);
  assert.deepEqual(row("Priority email help"), [false, false, true]);
  assert.equal(row("People on one account"), undefined);
  assert.ok(!rows.some((r) => /teammate|active tracks$|everything in/i.test(r.label) && r.label !== "Active tracks"));
  assert.equal(compareRows([free, pro], { billing: false, prices: false, live }).some((r) => /price/i.test(r.label)), false);
});
