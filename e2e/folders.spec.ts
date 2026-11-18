import { expect, logIn, test } from "./fixtures";

/**
 * Folders on Collections (owner, 16 Nov; one "New folder" sheet since option 43, 17 Nov): New folder offers a callout
 * and a group of callouts; the same sheet on a right-click on empty space or Shift+F10; a callout moves into a group
 * from its ··· menu and shows on the group's tile; renaming works; deleting the group puts the callout back in the list.
 */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A callout's row, by its spoken name ("Open Night set, callout, receiving, 12 tracks"). */
const calloutLink = (page: import("@playwright/test").Page, name: string) => page.getByRole("link", { name: new RegExp(`^Open ${escape(name)}, callout,`) });

test("a callout folder: create from New folder, file a callout, rename, delete, and the right-click sheet", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/collections");

  // The "New folder" sheet.
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const create = page.getByRole("dialog", { name: "New folder" });
  await expect(create.getByRole("radio", { name: /^Callout/ })).toBeVisible();
  await create.getByLabel("Name").fill("E2E crate");
  await create.getByRole("radio", { name: /^Group of callouts/ }).check();
  await create.getByRole("button", { name: "Create folder" }).click();
  const tile = page.locator("[data-card]").filter({ hasText: "E2E crate" });
  await expect(tile.getByText("0 callouts")).toBeVisible();

  // Move the first callout into it from its ··· menu.
  const callout = page.locator("[data-card]").filter({ has: page.getByRole("link", { name: /^Open .*, callout,/ }) }).first();
  const name = (await callout.getByRole("link").first().textContent())!.trim();
  await callout.getByRole("button", { name: `More for ${name}` }).click();
  await page.getByRole("menuitem", { name: "Move to folder" }).click();
  await page.getByRole("menuitemradio", { name: "E2E crate" }).click();
  await expect(tile.getByText("1 callout")).toBeVisible();
  await expect(calloutLink(page, name)).toHaveCount(0);

  // Open the folder: the callout is in it.
  await tile.getByRole("link", { name: "Open E2E crate, folder, 1 callout", exact: true }).click();
  await page.waitForURL(/\?folder=\d+/);
  await expect(calloutLink(page, name)).toBeVisible();
  await page.getByRole("link", { name: "All callouts" }).click();
  await page.waitForURL(/\/dashboard\/collections$/);

  // Right-click on empty space opens the same sheet; on a card, the card's own options.
  const list = page.getByRole("list", { name: "Folders" });
  // The grid's empty last column (a folder and one callout fill the first two at 1440px).
  await page.setViewportSize({ width: 1440, height: 900 });
  const grid = (await list.boundingBox())!;
  await page.mouse.click(grid.x + grid.width - 12, grid.y + 12, { button: "right" });
  await expect(page.getByRole("dialog", { name: "New folder" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "New folder" })).toHaveCount(0);
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
  await expect(calloutLink(page, name)).toBeVisible();
});

/** Projects: Upload audio beside New folder, which offers a project and a group of projects; the old explainer box is gone. */
test("Projects offers Upload audio, and New folder makes a project or a group of projects", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/projects");
  await expect(page.getByText("Add your own tracks")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Upload audio" }).first()).toBeVisible();
  await page.getByRole("button", { name: "New folder", exact: true }).click();
  const create = page.getByRole("dialog", { name: "New folder" });
  for (const item of [/^Project/, /^Group of projects/]) await expect(create.getByRole("radio", { name: item })).toBeVisible();
  // A callout isn't made from Projects.
  await expect(create.getByRole("radio", { name: /^Callout/ })).toHaveCount(0);
  await create.getByLabel("Name").fill("E2E project");
  await create.getByRole("radio", { name: /^Project/ }).check();
  await create.getByRole("button", { name: "Create folder" }).click();
  await expect(page.getByRole("link", { name: "Open E2E project, project, 0 tracks", exact: true })).toBeVisible();
  // It opens as a folder page with the one wide button.
  await page.getByRole("link", { name: "Open E2E project, project, 0 tracks", exact: true }).click();
  // The first open compiles the page in the dev server; give that room on a busy machine.
  await page.waitForURL(/\/dashboard\/projects\/\d+$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "E2E project" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add tracks" })).toBeVisible();
});
