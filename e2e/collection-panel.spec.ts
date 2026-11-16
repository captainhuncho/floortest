import { expect, logIn, test } from "./fixtures";

/**
 * A collection's details fold to their readout (owner, 16 Nov): folded on phones, open on desktop, the choice remembered
 * per collection; a callout has no Add tracks (Projects only).
 */
const toggle = (page: import("@playwright/test").Page) => page.getByRole("button", { name: /to review · .* received/ });

test("the details panel folds, opens, remembers the choice, and has no Add tracks on a callout", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/collections/2");

  // Phone: folded at first; the contents are out of the tab order.
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("section[aria-labelledby=about-h] [inert]").getByRole("button", { name: "Edit collection" })).toHaveCount(1);

  // Keyboard opens it.
  await toggle(page).focus();
  await page.keyboard.press("Enter");
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("section[aria-labelledby=about-h] [inert]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit collection" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add tracks" })).toHaveCount(0);

  // Remembered after a reload, even on a phone.
  await page.reload();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");

  // Desktop with no saved choice: open.
  await page.evaluate(() => localStorage.clear());
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.reload();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
  await toggle(page).click();
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
  await expect(page.locator("section[aria-labelledby=about-h] [inert]").getByRole("button", { name: "Edit collection" })).toHaveCount(1);
});
