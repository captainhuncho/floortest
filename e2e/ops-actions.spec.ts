import fs from "node:fs";
import path from "node:path";
import { expect, test } from "./fixtures";
import { currentStep, totpCode } from "../src/lib/totp";
import { OPS_EMAIL, OPS_INBOX_MESSAGE, OPS_TOTP_SECRET } from "./ops-account";

/**
 * Ops actions answer in place (ops server design, piece 1, 1 Nov): Inbox → Mark handled says so in the toast and the
 * message leaves the Open list, in the same page (no reload), then Reopen brings it back. Ops sign-in needs a password
 * and a two-step code every time; the seeded ops account's code comes from its test secret (e2e/ops-account.ts).
 */
// Two-step refuses a step it has already seen, so a rerun (--repeat-each) waits for a fresh one. The last step used is
// kept in the test copy's folder (fresh each run), as teams.spec.ts keeps its secret: each repeat loads this file anew.
const STEP_FILE = path.join(".e2e", "ops-totp-step");
async function freshCode() {
  const last = Number(fs.existsSync(STEP_FILE) ? fs.readFileSync(STEP_FILE, "utf8") : 0);
  while (currentStep() <= last) await new Promise((r) => setTimeout(r, 1000));
  const step = currentStep();
  fs.writeFileSync(STEP_FILE, String(step));
  return totpCode(OPS_TOTP_SECRET, step);
}

test("Inbox Mark handled and Reopen answer in place", async ({ page }) => {
  await page.goto("/ops-login");
  await page.getByLabel("Email").fill(OPS_EMAIL);
  await page.getByRole("textbox", { name: "Password" }).fill("floortest-demo");
  await page.getByLabel("Two-step code").fill(await freshCode());
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/admin/);

  await page.goto("/admin/inbox");
  const message = page.getByRole("listitem").filter({ hasText: OPS_INBOX_MESSAGE });
  await expect(message).toBeVisible();
  // A marker on this document: still there afterwards means the answer came in place, not by reloading the page.
  await page.evaluate(() => ((window as unknown as { opsMark: number }).opsMark = 1));

  await message.getByRole("button", { name: "Mark handled" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Marked handled" })).toBeVisible();
  await expect(message).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { opsMark?: number }).opsMark)).toBe(1);

  await page.getByRole("link", { name: /^Handled/ }).click();
  const handled = page.getByRole("listitem").filter({ hasText: OPS_INBOX_MESSAGE });
  await handled.getByRole("button", { name: "Reopen" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reopened" })).toBeVisible();
  await expect(handled).toHaveCount(0);
});
