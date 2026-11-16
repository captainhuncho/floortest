import { expect, logIn, test } from "./fixtures";

/**
 * Folders on Callouts (owner, 16 Nov): one "+ New" with New callout and New folder; the same menu on a right-click on
 * empty space or Shift+F10; a callout moves into a folder from its ··· menu and shows on the folder's tile; renaming
 * works; deleting the folder puts the callout back in the list.
 */
test("a callout folder: create from New, file a callout, rename, delete, and the right-click menu", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/collections");

  // The "+ New" menu.
  await page.getByRole("button", { name: "New", exact: true }).click();
  const menu = page.getByRole("menu", { name: "New" });
  await expect(menu.getByRole("menuitem", { name: "New callout" })).toBeVisible();
  await menu.getByRole("menuitem", { name: "New folder" }).click();
  const create = page.getByRole("dialog", { name: "New callout folder" });
  await create.getByLabel("Name").fill("E2E crate");
  await create.getByRole("button", { name: "Create" }).click();
  const tile = page.locator("[data-card]").filter({ hasText: "E2E crate" });
  await expect(tile.getByText("0 callouts")).toBeVisible();

  // Move the first callout into it from its ··· menu.
  const callout = page.locator("[data-card]").filter({ has: page.getByRole("button", { name: /^More for .*callout/i }) }).first();
  const name = (await callout.getByRole("link").first().textContent())!.trim();
  await callout.getByRole("button", { name: `More for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Move to folder" }).click();
  await page.getByRole("menuitemradio", { name: "E2E crate" }).click();
  await expect(tile.getByText("1 callout")).toBeVisible();
  await expect(page.locator("[data-card]").filter({ has: page.getByRole("link", { name, exact: true }) })).toHaveCount(0);

  // Open the folder: the callout is in it.
  await tile.getByRole("link", { name: "E2E crate" }).click();
  await page.waitForURL(/\?folder=\d+/);
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
  await page.getByRole("link", { name: "All callouts" }).click();
  await page.waitForURL(/\/dashboard\/collections$/);

  // Right-click on empty space opens the same menu; on a card, the card's own options.
  const list = page.getByRole("list", { name: "Callouts" });
  // The grid's empty third column (a folder and one callout fill the first two at 1440px).
  await page.setViewportSize({ width: 1440, height: 900 });
  const grid = (await list.boundingBox())!;
  await page.mouse.click(grid.x + grid.width - 12, grid.y + 12, { button: "right" });
  await expect(page.getByRole("menu", { name: "New" })).toBeVisible();
  await page.keyboard.press("Escape");
  await tile.click({ button: "right" });
  await expect(page.getByRole("menu", { name: "E2E crate" })).toBeVisible();
  await page.keyboard.press("Escape");

  // Rename, then delete: the callout comes back out.
  await tile.getByRole("button", { name: "More for E2E crate" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  const rename = page.getByRole("dialog", { name: "Rename folder" });
  await rename.getByLabel("Name").fill("E2E crate 2");
  await rename.getByRole("button", { name: "Save" }).click();
  const renamed = page.locator("[data-card]").filter({ hasText: "E2E crate 2" });
  await expect(renamed).toBeVisible();
  await renamed.getByRole("button", { name: "More for E2E crate 2" }).click();
  await page.getByRole("menuitem", { name: "Delete folder" }).click();
  await page.getByRole("dialog", { name: "Delete E2E crate 2?" }).getByRole("button", { name: "Delete folder" }).click();
  await expect(renamed).toHaveCount(0);
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
});

/** Projects: "+ New" offers Upload audio, New project and New folder; the old explainer box is gone. */
test("Projects' New menu offers Upload audio, New project and New folder", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/projects");
  await expect(page.getByText("Add your own tracks")).toHaveCount(0);
  await page.getByRole("button", { name: "New", exact: true }).click();
  const menu = page.getByRole("menu", { name: "New" });
  for (const item of ["Upload audio", "New project", "New folder"]) await expect(menu.getByRole("menuitem", { name: item })).toBeVisible();
  await menu.getByRole("menuitem", { name: "New project" }).click();
  const create = page.getByRole("dialog", { name: "New project" });
  await create.getByLabel("Name").fill("E2E project");
  await create.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("link", { name: "E2E project", exact: true })).toBeVisible();
});
