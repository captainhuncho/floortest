import { expect, logIn, test } from "./fixtures";

/**
 * Inside the phone app (its web view adds "FloorTestApp" to the user agent), the website's checkout never shows:
 * App Review 3.1.1 allows plans there to be bought only through the store. A direct link lands on Plans instead.
 */
test.use({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 FloorTestApp" });

test("in the app, a link to checkout lands on Plans", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/checkout?plan=pro");
  await expect(page).toHaveURL(/\/dashboard\/plans$/);
  await expect(page.getByRole("heading", { name: "Choose your plan" })).toBeVisible();
  await expect(page.locator('a[href^="/dashboard/checkout"]')).toHaveCount(0);
});
