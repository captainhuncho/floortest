import { expect, logIn, test } from "./fixtures";

/** Settings → Account's shortcut switch: off, K does nothing in the Queue; on again, K keeps (and Undo puts it back). */
test("the shortcut switch turns the Queue's letter keys off and on", async ({ page }) => {
  await logIn(page, "demo@floortest.test");

  const kept = page.getByText(/added to Prepare for set/);
  const keep = page.getByRole("complementary", { name: "Review" }).getByRole("button", { name: /^Keep/ }).locator("visible=true").first();

  // The Queue streams in as server HTML before React takes it over, so Keep shows a moment before K is listened for
  // (1 Nov: under a loaded full run K landed in that gap, nothing was kept and "added to Prepare for set" never came).
  // Wait until React owns the button, then a frame for its effects, before pressing K. Limit: "__reactProps" is React's
  // own internal key on a hydrated element, not a public API; a React upgrade could rename it, and then this poll fails
  // every run (never passes silently). The lasting fix is an app-side sign, such as a data attribute on the rail set
  // once its key listener is on (DecisionRail, the Queue screen).
  async function ready() {
    await expect(keep).toBeVisible();
    await expect.poll(() => keep.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps")))).toBe(true);
    await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  }

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
