import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { testDataDir } from "./test-db";

// A throwaway local database and secret for this test only, set before the app's modules load.
process.env.DATA_DIR = testDataDir("ft-plan-grant-");
process.env.APP_SECRET ??= "test-secret-".padEnd(48, "x");
delete process.env.DATABASE_URL;

// Approving a plan request gives the plan asked for, or another offered one at or above where they are now.
// A step down is changing someone's plan, which only a super admin may do (SUPER_ONLY in src/lib/ops-perms.ts).
test("a plan request can't be used to move someone to a lower or retired plan", async () => {
  const { grantablePlan } = await import("../src/lib/plan-requests");
  const plan = (id: string, position: number, retired = false) => ({ id, position, retired });
  const plans = [plan("free", 1), plan("pro", 2), plan("team", 3), plan("old", 4, true)];
  const pick = (chosen: string, asked: string, current: string) => grantablePlan(plans, chosen, asked, current)?.id;

  assert.equal(pick("team", "team", "free"), "team", "what they asked for");
  assert.equal(pick("pro", "team", "free"), "pro", "a smaller step up that fits better");
  assert.equal(pick("team", "pro", "pro"), "team", "at or above the current plan");
  assert.equal(pick("pro", "pro", "team"), "pro", "the plan they asked for, even if it's lower");
  assert.equal(pick("free", "team", "pro"), undefined, "never down when they didn't ask for it");
  assert.equal(pick("pro", "team", "team"), undefined);
  assert.equal(pick("old", "old", "free"), undefined, "retired plans aren't offered");
  assert.equal(pick("nope", "team", "free"), undefined);
  assert.equal(pick("team", "team", "gone"), "team", "an unknown current plan doesn't block the request");
});

test("approvePlanRequest picks the plan through grantablePlan", () => {
  // Server actions need an ops session, so this checks the code path.
  const src = fs.readFileSync(new URL("../src/app/admin/actions.ts", import.meta.url), "utf8");
  const body = src.slice(src.indexOf("export async function approvePlanRequest")).split("\nexport ")[0];
  assert.match(body, /grantablePlan\(/);
});
