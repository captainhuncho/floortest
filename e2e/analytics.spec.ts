import { expect, logIn, test } from "./fixtures";

/**
 * Analytics (owner, 16 Nov): the desk's own numbers and its shared links, for a period picked from one menu. The owner
 * reaches it from the menu and from Account; it never shows visits to the link.
 */
test("the owner opens Analytics, switches period, and sees the desk's own numbers", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto("/dashboard/floor");
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Analytics" }).click();
  await page.waitForURL(/\/dashboard\/analytics/);
  await expect(page.getByRole("heading", { name: "Analytics", level: 1 })).toBeVisible();

  // One picker for the periods; Lifetime covers the demo desk's tracks whatever today's date is.
  await page.getByRole("button", { name: /Period: Last 30 days/ }).click();
  const menu = page.getByRole("menu");
  for (const p of ["Last 7 days", "Last 30 days", "Last 3 months", "This year", "Lifetime"]) await expect(menu.getByRole("menuitemradio", { name: p })).toBeVisible();
  await menu.getByRole("menuitemradio", { name: "Lifetime" }).click();
  await page.waitForURL(/\?p=all/);
  // The big number with its words, then the line of real figures under it.
  await expect(page.getByText(/^\d+ tracks? in$/)).toBeVisible();
  await expect(page.getByText(/^From \d+ senders? · you kept \d+/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tracks in and kept, by month" })).toBeVisible();
  // The chart's numbers are in a table for screen readers.
  await expect(page.getByRole("table", { name: /Tracks in and kept in total/ })).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "What happened" })).toBeVisible();
  await expect(page.getByRole("link", { name: "See everything in Activity" })).toHaveAttribute("href", "/dashboard/activity");
  await expect(page.getByRole("heading", { name: "Who sent what" })).toBeVisible();
  // Each sender row opens that sender's contact page.
  await expect(page.getByRole("region", { name: "Who sent what" }).getByRole("link").first()).toHaveAttribute("href", /\/dashboard\/contacts\/\d+$/);
  // Nothing about visitors to the link, and no comparison for Lifetime.
  await expect(page.getByText(/visits? to your link/i)).toHaveCount(0);
  await expect(page.getByText(/than the/)).toHaveCount(0);

  // An address with an unknown period falls back to the default.
  await page.goto("/dashboard/analytics?p=forever");
  await expect(page.getByRole("button", { name: /Period: Last 30 days/ })).toBeVisible();

  // On a phone it is a row under Your desk on Settings.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dashboard/settings");
  await expect(page.getByRole("region", { name: "Your desk" }).getByRole("link", { name: /^Analytics/ })).toBeVisible();
});
