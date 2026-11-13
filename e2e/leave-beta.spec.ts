import { expect, test } from "./fixtures";
import { opsLogIn } from "./ops-login";

/**
 * Ops → Leave beta (Safety, 13 Nov): Paid plans and checkout can't be turned on, here or in Feature switches, until
 * the owner marks both checklist items done; each mark goes in the admin log. Saves phone and desktop renders.
 */
test("Leave beta blocks paid plans until the owner's checklist is done", async ({ page }) => {
  await opsLogIn(page);

  await page.goto("/admin/leave-beta");
  await expect(page.getByRole("heading", { name: "Leave beta", level: 1 })).toBeVisible();
  const billing = page.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Paid plans and checkout" }) });
  await expect(billing.getByText("Off, blocked")).toBeVisible();
  await expect(billing.getByRole("button", { name: "Turn on Paid plans and checkout" })).toHaveCount(0);
  await expect(page.getByText("Not built yet")).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("leave-beta-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: test.info().outputPath("leave-beta-phone.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto("/admin/switches");
  const fromSwitches = page.locator("#switch-billing");
  await expect(fromSwitches.getByRole("link", { name: /Waiting on card payments connected/ })).toBeVisible();
  await expect(fromSwitches.getByRole("button", { name: "Turn on Paid plans and checkout" })).toHaveCount(0);

  await page.goto("/admin/leave-beta");
  for (const label of ["Card payments connected", "Lawyer's renewal wording approved"]) {
    const item = billing.getByRole("listitem").filter({ hasText: label });
    await item.getByRole("button", { name: "Mark done" }).click();
    await page.locator("dialog[open]").getByRole("button", { name: "Mark done" }).click();
    await expect(item.getByText("Done", { exact: true })).toBeVisible();
  }
  await expect(billing.getByText("Off, ready")).toBeVisible();
  await expect(billing.getByRole("button", { name: "Turn on Paid plans and checkout" })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("leave-beta-ready-desktop.png"), fullPage: true });

  await page.goto("/admin/log");
  // Each mark is a log line naming the item (the action filter's own "marked done" option doesn't count).
  await expect(page.getByText("Lawyer's renewal wording approved").first()).toBeVisible();
  await expect(page.getByText("Card payments connected").first()).toBeVisible();
});
