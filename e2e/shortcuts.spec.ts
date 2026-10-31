import { expect, logIn, test } from "./fixtures";

/** Settings → Account's shortcut switch: off, K does nothing in the Queue; on again, K keeps (and Undo puts it back). */
test("the shortcut switch turns the Queue's letter keys off and on", async ({ page }) => {
  await logIn(page, "demo@floortest.test");

  const kept = page.getByText(/added to Prepare for set/);
  const keep = page.getByRole("complementary", { name: "Review" }).getByRole("button", { name: /^Keep/ }).locator("visible=true").first();

  // Off: K is ignored and the track stays up for review.
  await page.evaluate(() => localStorage.setItem("ft:shortcuts", "off"));
  await page.goto("/dashboard/review?view=queue");
  await expect(keep).toBeVisible();
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("k");
  await page.waitForTimeout(800);
  await expect(kept).toHaveCount(0);
  await expect(keep).toBeVisible();

  // On: K keeps the track, then Undo puts it back.
  await page.evaluate(() => localStorage.removeItem("ft:shortcuts"));
  await page.reload();
  await expect(keep).toBeVisible();
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("k");
  await expect(kept.first()).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).first().click();
});
