import { expect, test, signUp } from "./fixtures";

/**
 * The first-visit tour (owner, 6 Nov): a new account gets it on the Floor once (signUp checks it opens and skips it),
 * closing it counts as seen so it doesn't come back, and How FloorTest works replays all six cards any time.
 */
const stamp = Date.now().toString(36);
const desk = { handle: `tour${stamp}`, email: `tour+${stamp}@example.test`, password: "Correct-Horse-Battery-77" };

test("a new account sees the tour once, and How FloorTest works replays it", async ({ page }) => {
  await signUp(page, { kind: "DJ", first: "Tove", last: "Fresh", handle: desk.handle, email: desk.email, password: desk.password });

  // Skipped once: back on the Floor it stays closed.
  await page.goto("/dashboard/floor");
  await expect(page.getByRole("heading", { name: /Tove/ })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);

  await page.goto("/dashboard/how-it-works");
  await page.getByRole("button", { name: "Take the tour" }).click();
  const tour = page.getByRole("dialog", { name: "Your link is your inbox" });
  await expect(tour.getByText("Step 1 of 6")).toBeVisible();
  for (const title of ["The Floor shows what needs you", "Keep or Not for me", "Collections for callouts", "Take kept tracks to your set", "Share your link"]) {
    await page.getByRole("dialog").getByRole("button", { name: "Next" }).click();
    await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  }
  await expect(page.getByRole("dialog").getByText("Step 6 of 6")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Share your link" }).click();
  await page.waitForURL(/\/dashboard\/floor/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
