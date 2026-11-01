import { expect, hydrated, logIn, test } from "./fixtures";

/** Settings → Account's shortcut switch: off, K does nothing in the Queue; on again, K keeps (and Undo puts it back). */
test("the shortcut switch turns the Queue's letter keys off and on", async ({ page }) => {
  await logIn(page, "demo@floortest.test");

  const kept = page.getByText(/added to Prepare for set/);
  const keep = page.getByRole("complementary", { name: "Review" }).getByRole("button", { name: /^Keep/ }).locator("visible=true").first();

  // The Queue streams in as server HTML before React takes it over, so Keep shows a moment before K is listened for
  // (1 Nov: under a loaded full run K landed in that gap, nothing was kept and "added to Prepare for set" never came).
  // hydrated() waits for React first (its limit is in fixtures.ts). The lasting fix is an app-side sign, such as a data
  // attribute on the rail set once its key listener is on (DecisionRail, the Queue screen).
  const ready = () => hydrated(keep);

  // Off: K is ignored and the track stays up for review.
  await page.evaluate(() => localStorage.setItem("ft:shortcuts", "off"));
  await page.goto("/dashboard/review?view=queue");
  await ready();
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("k");
  await page.waitForTimeout(800);
  await expect(kept).toHaveCount(0);
  await expect(keep).toBeVisible();

  // On: K keeps the track, then Undo puts it back.
  await page.evaluate(() => localStorage.removeItem("ft:shortcuts"));
  await page.reload();
  await ready();
  await page.locator("body").click({ position: { x: 1, y: 1 } });
  await page.keyboard.press("k");
  await expect(kept.first()).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).first().click();
});
