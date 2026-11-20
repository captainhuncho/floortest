import { expect, hydrated, logIn, test } from "./fixtures";

/**
 * Report a track from the desk (App Store Review 1.2): Report is in the review card's More menu, opens a short form in
 * its own layer, and the report reaches the FloorTest team. The demo desk is its owner, so the "Also block" box shows; it stays
 * unticked here so other specs keep their sender.
 */
test("a receiver reports a track from the desk", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/review?view=queue&s=all");
  // Report lives in More (review card option 1; owner, 20 Nov): nothing on the card itself reports a track.
  const more = page.locator("#review-card").getByRole("button", { name: "More", exact: true });
  await hydrated(more);
  await more.click();
  await page.getByRole("menu", { name: "More" }).getByRole("menuitem", { name: "Report" }).click();

  const form = page.getByRole("group", { name: "Report this track" });
  await expect(form.getByRole("radio", { name: "Abusive, hateful or harmful" })).toBeChecked();
  await form.getByText("Something else").click();
  await page.getByLabel("Anything we should know (optional)").fill("e2e: checking the report button");
  await expect(page.getByRole("checkbox", { name: /^Also block / })).toBeVisible();

  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reported. The FloorTest team will look at it." })).toBeVisible();
});
