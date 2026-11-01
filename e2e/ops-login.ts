import fs from "node:fs";
import path from "node:path";
import { expect, type Page } from "@playwright/test";
import { currentStep, totpCode } from "../src/lib/totp";
import { OPS_EMAIL, OPS_TOTP_SECRET } from "./ops-account";

/**
 * Ops sign-in for the e2e specs (ops-actions, ops-kit): a password and a two-step code every time; the seeded ops
 * account's code comes from its test secret (e2e/ops-account.ts).
 */
// Two-step refuses a step it has already seen, so a rerun (--repeat-each) waits for a fresh one. The last step used is
// kept in the test copy's folder (fresh each run), as teams.spec.ts keeps its secret: each repeat loads this file anew.
const STEP_FILE = path.join(".e2e", "ops-totp-step");
async function freshCode() {
  // Read straight away, not check-then-read (CodeQL js/file-system-race): no file yet means no step used yet.
  let last = 0;
  try {
    last = Number(fs.readFileSync(STEP_FILE, "utf8")) || 0;
  } catch {}
  while (currentStep() <= last) await new Promise((r) => setTimeout(r, 1000));
  const step = currentStep();
  fs.writeFileSync(STEP_FILE, String(step));
  return totpCode(OPS_TOTP_SECRET, step);
}

export async function opsLogIn(page: Page) {
  await page.goto("/ops-login");
  await page.getByLabel("Email").fill(OPS_EMAIL);
  await page.getByRole("textbox", { name: "Password" }).fill("floortest-demo");
  await page.getByLabel("Two-step code").fill(await freshCode());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin/);
}


/** Turns the site-wide `ops_shell` switch ("New ops navigation") on or off from Feature switches, as the super admin. */
export async function flipOpsShell(page: Page, on: boolean) {
  await page.goto("/admin/switches");
  const row = page.getByRole("listitem").filter({ hasText: "New ops navigation" });
  await row.getByRole("button", { name: `${on ? "Turn on" : "Turn off"} New ops navigation` }).click();
  await page.locator("dialog[open]").getByRole("button", { name: on ? "Turn on" : "Turn off" }).click();
  await expect(row.getByText(on ? "On" : "Off", { exact: true })).toBeVisible();
}
