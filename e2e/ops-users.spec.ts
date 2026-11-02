import { expect, test } from "./fixtures";
import { flipOpsShell, opsLogIn } from "./ops-login";

/**
 * The new Users (admin redesign B, step 5) behind the `ops_shell` switch: saved views in the address, edit in place
 * (tags, a note, the status's Suspend… with a required reason), Shift-click ranges tagged from the bulk bar, and the
 * record drawer with focus kept inside and given back. With the switch off, today's page. The switch goes back off at
 * the end, even when a step fails, so the other specs see today's ops.
 */
test("ops users: off is today's page; on, views in the URL, edit in place, bulk tag, the record drawer", async ({ page }) => {
  test.setTimeout(240_000);
  await opsLogIn(page);

  await test.step("switch off: today's Users", async () => {
    await page.goto("/admin/accounts");
    await expect(page.getByText("Everyone with a link, and everyone who has sent them a track.")).toBeVisible();
    await expect(page.getByRole("radiogroup", { name: "Layout" })).toHaveCount(0);
  });

  await flipOpsShell(page, true);
  try {
    const table = page.getByRole("table", { name: "Accounts" });
    const lena = table.getByRole("row").filter({ hasText: "Lena Listener" });

    await test.step("switch on: the table lists the seeded accounts, with views and the layout switch", async () => {
      await page.goto("/admin/accounts");
      await expect(page.getByRole("heading", { level: 1, name: "Users" })).toBeVisible();
      await expect(page.getByRole("radiogroup", { name: "Layout" })).toBeVisible();
      await expect(lena).toHaveCount(1);
      expect(await table.getByRole("row").count()).toBeGreaterThan(3);
      await expect(page.getByRole("navigation", { name: "Saved views" }).getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "page");
      // The Edit button is a full-strength control on every row (a11y B fix 10).
      await expect(lena.getByRole("button", { name: "Edit Lena Listener" })).toHaveCSS("opacity", "1");
    });

    await test.step("a tag edited in place is cleaned, saved, shown, and still there after a reload", async () => {
      await lena.getByRole("button", { name: /edit tags for Lena Listener/ }).click();
      const field = lena.getByRole("textbox", { name: /^Add tags for Lena Listener/ });
      await expect(field).toBeFocused();
      await field.fill(" ,E2E-Inline , e2e-inline ");
      await field.press("Enter");
      // One chip, cleaned and not repeated, with its own × to take it off.
      await expect(lena.getByRole("button", { name: "Remove e2e-inline" })).toHaveCount(1);
      await expect(field).toHaveValue("");
      await field.press("Enter");
      await expect(page.getByRole("status").filter({ hasText: /^Tags saved for @/ })).toBeVisible();
      await expect(lena.getByRole("button", { name: /edit tags for Lena Listener/ })).toContainText("e2e-inline");
      await page.reload();
      await expect(lena.getByRole("button", { name: /edit tags for Lena Listener/ })).toContainText("e2e-inline");
    });

    await test.step("a note added in place shows as the latest note", async () => {
      await lena.getByRole("button", { name: /edit a new note for Lena Listener/ }).click();
      const note = lena.getByRole("textbox", { name: "a new note for Lena Listener" });
      await note.fill("E2E: called about the beta");
      await note.press("Enter");
      await expect(page.getByRole("status").filter({ hasText: /^Note added for @/ })).toBeVisible();
      await page.reload();
      await expect(lena.getByRole("button", { name: /edit a new note for Lena Listener/ })).toContainText("E2E: called about the beta");
    });

    await test.step("Suspend from a row asks for a reason first; Cancel changes nothing", async () => {
      await lena.getByRole("button", { name: /edit status for Lena Listener/ }).click();
      await lena.getByRole("combobox", { name: "status for Lena Listener" }).selectOption("Suspended");
      const ask = page.getByRole("dialog", { name: "Suspend Lena Listener?" });
      await expect(ask).toBeVisible();
      const yes = ask.getByRole("button", { name: "Suspend", exact: true });
      await expect(yes).toBeDisabled();
      await ask.getByLabel("Reason (they see this)").fill("e2e: checking the reason is asked");
      await expect(yes).toBeEnabled();
      await ask.getByRole("button", { name: "Cancel" }).click();
      await expect(ask).toBeHidden();
      await expect(lena.getByRole("button", { name: /edit status for Lena Listener/ })).not.toContainText("Suspended");
      // The super admin may change one account's plan here (never in bulk).
      await expect(lena.getByRole("button", { name: /edit plan for Lena Listener/ })).toBeVisible();
    });

    await test.step("Shift-click picks a range, and the bulk bar tags it", async () => {
      const boxes = table.getByRole("checkbox", { name: /^Select (?!every)/ });
      await boxes.nth(0).click();
      await boxes.nth(2).click({ modifiers: ["Shift"] });
      for (const i of [0, 1, 2]) await expect(boxes.nth(i)).toBeChecked();
      await expect(boxes.nth(3)).not.toBeChecked();
      const bar = page.getByRole("toolbar", { name: "Bulk actions, 3 selected" });
      await expect(bar).toBeVisible();
      await expect(bar.getByRole("button", { name: /plan/i })).toHaveCount(0);
      await bar.getByRole("textbox", { name: "Tag to add" }).fill("e2e-users");
      await bar.getByRole("button", { name: "Add tag" }).click();
      await expect(page.getByRole("status").filter({ hasText: "Tagged 3 accounts e2e-users" })).toBeVisible();
      await expect(table.getByText("e2e-users", { exact: true })).toHaveCount(3);
    });

    await test.step("with rows picked, j moves focus to rows near the bottom and they never sit under the bulk bar", async () => {
      await page.setViewportSize({ width: 1280, height: 560 });
      const boxes = table.getByRole("checkbox", { name: /^Select (?!every)/ });
      await boxes.nth(0).click();
      await boxes.nth(1).click();
      const bar = page.getByRole("toolbar", { name: /^Bulk actions/ });
      await expect(bar).toBeVisible();
      await page.getByRole("heading", { level: 1, name: "Users" }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      const rows = table.locator("tbody tr");
      const count = await rows.count();
      for (let i = 0; i < count; i++) {
        await page.keyboard.press("j");
        const focused = table.locator("tbody tr:focus");
        await expect(focused).toHaveCount(1);
        const [r, b] = await Promise.all([focused.boundingBox(), bar.boundingBox()]);
        expect(r && b, "row and bar are on screen").toBeTruthy();
        expect(r!.y + r!.height, `row ${i + 1} ends above the bar`).toBeLessThanOrEqual(b!.y + 1);
        expect(r!.y, `row ${i + 1} starts below the top bar`).toBeGreaterThanOrEqual(60);
      }
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.keyboard.press("Escape");
      await expect(bar).toBeHidden();
    });

    await test.step("a saved view is in the address and survives a reload", async () => {
      const views = page.getByRole("navigation", { name: "Saved views" });
      await views.getByRole("link", { name: /^Unconfirmed/ }).click();
      await page.waitForURL(/[?&]view=unconfirmed/);
      await expect(views.getByRole("link", { name: /^Unconfirmed/ })).toHaveAttribute("aria-current", "page");
      await page.reload();
      await expect(page).toHaveURL(/[?&]view=unconfirmed/);
      await expect(views.getByRole("link", { name: /^Unconfirmed/ })).toHaveAttribute("aria-current", "page");
      await views.getByRole("link", { name: /^All/ }).click();
      await page.waitForURL((u) => !u.search.includes("view="));
    });

    await test.step("the record drawer opens from the row, keeps focus inside, and gives it back", async () => {
      const open = lena.getByRole("button", { name: "Open Lena Listener" });
      await open.click();
      const drawer = page.getByRole("dialog", { name: "Lena Listener" });
      await expect(drawer).toBeVisible();
      await expect(drawer).toHaveAttribute("aria-modal", "true");
      await expect(drawer.getByRole("link", { name: "Open full record" })).toBeVisible();
      for (let i = 0; i < 12; i++) {
        await page.keyboard.press("Tab");
        expect(await drawer.evaluate((d) => d.contains(document.activeElement))).toBe(true);
      }
      await page.keyboard.press("Escape");
      await expect(drawer).toBeHidden();
      await expect(open).toBeFocused();
    });

    await test.step("keys: j moves to a row, Enter opens its record, ? lists the Users keys", async () => {
      await page.getByRole("heading", { level: 1, name: "Users" }).click();
      await page.keyboard.press("j");
      const focused = table.locator("tbody tr:focus");
      await expect(focused).toHaveCount(1);
      const name = (await focused.getByRole("button", { name: /^Open / }).getAttribute("aria-label"))!.replace(/^Open /, "");
      await page.keyboard.press("Enter");
      await expect(page.getByRole("dialog", { name })).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog", { name })).toBeHidden();
      await expect(table.getByRole("row").filter({ hasText: name })).toBeFocused();
      await page.keyboard.press("?");
      const keys = page.getByRole("dialog", { name: "Keyboard shortcuts" });
      await expect(keys.getByText("Edit the current row (its tags)")).toBeVisible();
      await page.keyboard.press("Escape");
    });
  } finally {
    await flipOpsShell(page, false);
  }

  await test.step("switch off again: today's page is back", async () => {
    await page.goto("/admin/accounts");
    await expect(page.getByText("Everyone with a link, and everyone who has sent them a track.")).toBeVisible();
  });
});
