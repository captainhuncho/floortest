import { expect, hydrated, logIn, test } from "./fixtures";

/**
 * A folder's page has no play button on the rows (owner, 19 Nov). Tapping a track plays it; tapping the track already
 * playing pauses it and tapping again resumes, like the review queue (owner, 20 Nov). Enter does the same as a tap.
 */
test("on a callout's page, tapping the current track pauses and resumes it", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/collections/2");
  const tracks = page.getByRole("list", { name: "Review Queue" });
  const first = tracks.getByRole("button", { name: /^Play / }).first();
  await hydrated(first);
  const title = ((await first.getAttribute("aria-label")) ?? "").replace(/^Play /, "").split(",")[0];
  const row = (verb: string) => tracks.getByRole("button", { name: new RegExp(`^${verb} ${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) });

  await first.click();
  await expect(row("Pause")).toBeVisible();
  await row("Pause").click();
  await expect(row("Play")).toBeVisible();
  await row("Play").focus();
  await page.keyboard.press("Enter");
  await expect(row("Pause")).toBeVisible();
});
