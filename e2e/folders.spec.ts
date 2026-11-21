import { expect, logIn, test } from "./fixtures";

/**
 * Folders on Collections (owner, 16 Nov; + Add since option 66, 20 Nov): + Add on Callouts offers Callout and Folder;
 * the same menu on a right-click on empty space; a callout moves into a folder from its ··· menu and shows on the
 * folder's tile; renaming works; deleting the folder puts the callout back in the list.
 */
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** A callout's row, by its spoken name ("Open Night set, callout, receiving, 12 tracks"). */
const calloutLink = (page: import("@playwright/test").Page, name: string) => page.getByRole("link", { name: new RegExp(`^Open ${escape(name)}, callout,`) });

test("a callout folder: create from + Add, file a callout, rename, delete, and the right-click menu", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/collections");

  // + Add: Callout and Folder, focus on the first item; Folder opens the name sheet.
  const add = page.getByRole("button", { name: "Add", exact: true });
  await add.click();
  const menu = page.getByRole("menu", { name: "Add to Callouts" });
  await expect(menu.getByRole("menuitem")).toHaveText([/^Callout/, /^Folder/]);
  await expect(menu.getByRole("menuitem", { name: /^Callout/ })).toBeFocused();
  await expect(menu.getByRole("menuitem", { name: /Record/ })).toHaveCount(0);
  await menu.getByRole("menuitem", { name: /^Folder/ }).click();
  const create = page.getByRole("dialog", { name: "New folder" });
  await create.getByLabel("Name").fill("E2E crate");
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
  await page.waitForURL(/[?&]folder=\d+/);
  await expect(calloutLink(page, name)).toBeVisible();
  // Inside a callouts folder + Add stays with Callout only (no folders in folders; option 66 v147).
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("menu", { name: "Add to Callouts" }).getByRole("menuitem")).toHaveText([/^Callout/]);
  await page.keyboard.press("Escape");
  await page.getByRole("link", { name: "All callouts" }).click();
  await page.waitForURL(/\/dashboard\/collections\?tab=callouts$/);

  // Right-click on empty space opens + Add's menu; Escape closes it and focus goes back to the button. On a card, its own options.
  const list = page.getByRole("list", { name: "Callouts" });
  // The grid's empty last column (a folder and one callout fill the first two at 1440px).
  await page.setViewportSize({ width: 1440, height: 900 });
  const grid = (await list.boundingBox())!;
  await page.mouse.click(grid.x + grid.width - 12, grid.y + 12, { button: "right" });
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await expect(add).toBeFocused();
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

/**
 * A delete that doesn't go through says so (20 Nov: a test click closed the dialog silently and the folder stayed). Here
 * the folder is deleted in a second tab first, so the first tab's delete is refused: the dialog stays with the reason.
 */
test("deleting a folder that's already gone keeps the dialog open and says why", async ({ page, context }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/collections");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menu", { name: "Add to Callouts" }).getByRole("menuitem", { name: /^Folder/ }).click();
  const create = page.getByRole("dialog", { name: "New folder" });
  await create.getByLabel("Name").fill("E2E gone crate");
  await create.getByRole("button", { name: "Create folder" }).click();
  const tile = page.locator("[data-card]").filter({ hasText: "E2E gone crate" });
  await expect(tile).toBeVisible();

  await tile.getByRole("button", { name: "More for E2E gone crate" }).click();
  await page.getByRole("menuitem", { name: "Delete folder" }).click();
  const confirm = page.getByRole("dialog", { name: "Delete E2E gone crate?" });
  await expect(confirm).toBeVisible();

  const other = await context.newPage();
  await other.goto("/dashboard/collections");
  const otherTile = other.locator("[data-card]").filter({ hasText: "E2E gone crate" });
  await otherTile.getByRole("button", { name: "More for E2E gone crate" }).click();
  await other.getByRole("menuitem", { name: "Delete folder" }).click();
  await other.getByRole("dialog", { name: "Delete E2E gone crate?" }).getByRole("button", { name: "Delete folder" }).click();
  await expect(otherTile).toHaveCount(0);
  await other.close();

  await confirm.getByRole("button", { name: "Delete folder" }).click();
  await expect(confirm.getByRole("alert")).toHaveText("That folder isn't there any more.");
  await expect(confirm).toBeVisible();
});

/** Projects (option 66): /dashboard/projects is a tab now; + Add offers Import, Project and Folder; a new project opens its page. */
test("Projects is a tab, its + Add offers Import, Project and Folder, and a new project opens its page", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/projects");
  await page.waitForURL(/\/dashboard\/collections\?tab=projects$/);
  await expect(page.getByRole("tab", { name: "Projects", selected: true })).toBeVisible();
  // Old ?kind=callouts links still land on Callouts.
  await page.goto("/dashboard/collections?kind=callouts");
  await expect(page.getByRole("tab", { name: "Callouts", selected: true })).toBeVisible();
  await page.getByRole("tab", { name: "Projects" }).click();
  await page.waitForURL(/\?tab=projects$/);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  const menu = page.getByRole("menu", { name: "Add to Projects" });
  await expect(menu.getByRole("menuitem")).toHaveText([/^Import/, /^Project/, /^Folder/]);
  // A tap outside closes it.
  await page.getByRole("heading", { name: "Collections", level: 1 }).click();
  await expect(menu).toHaveCount(0);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await menu.getByRole("menuitem", { name: /^Project/ }).click();
  const create = page.getByRole("dialog", { name: "New project" });
  await create.getByLabel("Name").fill("E2E project");
  await create.getByRole("button", { name: "Create project" }).click();
  // Creating a project opens its page. The first open compiles the page in the dev server; give that room on a busy machine.
  await page.waitForURL(/\/dashboard\/projects\/\d+$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { level: 1, name: "E2E project" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add tracks" })).toBeVisible();
});
