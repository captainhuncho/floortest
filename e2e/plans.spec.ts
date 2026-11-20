import { expect, hydrated, logIn, test } from "./fixtures";

// Plans (option 62 A, 19 Nov): on a phone the plans are a pick list with one button for the picked plan, and the full
// table sits behind "Compare every plan". In the seeded beta, billing is off and plan requests are closed, so checkout
// sends people back to the plans page and bigger plans read "Set by FloorTest during the beta".
test("phone: pick a plan, the one button follows it, and the table opens on tap", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/plans");
  const plans = page.getByRole("group", { name: "Plans" });
  const team = plans.getByRole("radio", { name: /Team/ });
  await hydrated(team);
  // One plan starts picked; picking another opens it and moves the one button to it.
  await expect(plans.getByRole("radio", { checked: true })).toHaveCount(1);
  await team.check({ force: true });
  await expect(team).toBeChecked();
  await expect(page.getByText("Everything in Pro", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Set by FloorTest during the beta")).toBeVisible();
  // The compare table is one tap away, the same table as before.
  const table = page.getByRole("table");
  await expect(table).toBeHidden();
  await page.getByText("Compare every plan", { exact: true }).first().click();
  await expect(table).toBeVisible();
  await expect(table.getByRole("rowheader", { name: "Active tracks" })).toBeVisible();
});

test("laptop: three quiet cards, and checkout in the beta goes back to plans", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/plans");
  await expect(page.getByRole("heading", { level: 2, name: "Team" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Plans" })).toBeHidden();
  await expect(page.getByText("Renewal and billing")).toBeVisible();
  await page.goto("/dashboard/checkout?plan=pro");
  await expect(page).toHaveURL(/\/dashboard\/plans$/);
});
