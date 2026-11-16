import { expect, logIn, test } from "./fixtures";

/**
 * Report a track from the desk (App Store Review 1.2): the button sits under the track, opens a short form in place,
 * and the report reaches the FloorTest team. The demo desk is its owner, so the "Also block" box shows; it stays
 * unticked here so other specs keep their sender.
 */
test("a receiver reports a track from the desk", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/review?view=queue&s=all");
  // Report lives in the track's Details, whose summary names it.
  const details = page.locator("summary").filter({ hasText: "report" });
  if (!(await page.getByRole("button", { name: "Report", exact: true }).isVisible())) await details.click();
  await page.getByRole("button", { name: "Report", exact: true }).click();

  const form = page.getByRole("group", { name: "Report this track" });
  await expect(form.getByRole("radio", { name: "Abusive, hateful or harmful" })).toBeChecked();
  await form.getByText("Something else").click();
  await page.getByLabel("Anything we should know (optional)").fill("e2e: checking the report button");
  await expect(page.getByRole("checkbox", { name: /^Also block / })).toBeVisible();

  await page.getByRole("button", { name: "Send report" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Reported. The FloorTest team will look at it." })).toBeVisible();
});
