import { expect, test } from "./fixtures";
import { OPS_FEEDBACK_MESSAGE } from "./ops-account";
import { opsLogIn } from "./ops-login";

/**
 * The ops kit's first screens (admin redesign B, step 1): the Feedback status switch answers in place, ⌘K finds a
 * person by @handle and opens them, the Users table picks a range with Shift-click and tags it from the bulk bar, and
 * the suspend confirm starts on Cancel and closes on Escape. One sign-in for all of it: ops sign-in needs a fresh
 * two-step code each time, which can mean waiting half a minute.
 */
test("ops kit: Feedback switch, ⌘K people, bulk select and tag, confirm focus", async ({ page }) => {
  await opsLogIn(page);

  await test.step("Feedback status changes in place", async () => {
    await page.goto("/admin/feedback?status=all");
    const item = page.getByRole("listitem").filter({ hasText: OPS_FEEDBACK_MESSAGE });
    await expect(item).toBeVisible();
    // A marker on this document: still there afterwards means the answer came in place, not by reloading the page.
    await page.evaluate(() => ((window as unknown as { opsMark: number }).opsMark = 1));
    const status = item.getByRole("group", { name: "Status" });
    await status.getByRole("button", { name: "Planned" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Marked planned" })).toBeVisible();
    await expect(status.getByRole("button", { name: "Planned" })).toHaveAttribute("aria-pressed", "true");
    expect(await page.evaluate(() => (window as unknown as { opsMark?: number }).opsMark)).toBe(1);
    // Back to New, so a rerun starts the same way.
    await status.getByRole("button", { name: "New" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Moved back to New" })).toBeVisible();
    await expect(status.getByRole("button", { name: "New" })).toHaveAttribute("aria-pressed", "true");
  });

  await test.step("⌘K finds a person by @handle and Enter opens them", async () => {
    await page.goto("/admin");
    await page.keyboard.press("ControlOrMeta+k");
    const palette = page.getByRole("dialog", { name: "Search people, pages and actions" });
    await expect(palette).toBeVisible();
    const box = palette.getByRole("combobox");
    await expect(box).toBeFocused();
    await box.fill("@lena");
    await expect(palette.getByRole("option", { name: /Lena Listener/ })).toBeVisible();
    await expect(palette.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
    await box.press("Enter");
    await page.waitForURL(/\/admin\/accounts\/\d+$/);
    await expect(palette).toBeHidden();
    await expect(page.getByRole("heading", { name: /Lena Listener/ }).first()).toBeVisible();
  });

  await test.step("Shift-click picks a range, and the bulk bar tags it", async () => {
    await page.goto("/admin/accounts");
    const boxes = page.getByRole("table").getByRole("checkbox", { name: /^Select (?!every)/ });
    await boxes.nth(0).click();
    await boxes.nth(2).click({ modifiers: ["Shift"] });
    for (const i of [0, 1, 2]) await expect(boxes.nth(i)).toBeChecked();
    await expect(boxes.nth(3)).not.toBeChecked();
    await expect(page.getByRole("table").getByRole("row", { selected: true })).toHaveCount(3);
    const bar = page.getByRole("toolbar", { name: "Bulk actions, 3 selected" });
    await expect(bar).toBeVisible();
    await bar.getByRole("textbox", { name: "Tag to add" }).fill(" ,E2E-kit ");
    await bar.getByRole("button", { name: "Add tag" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Tagged 3 accounts e2e-kit" })).toBeVisible();
    await expect(page.getByRole("toolbar", { name: /Bulk actions/ })).toBeHidden();
    await expect(page.getByRole("table").getByText("e2e-kit", { exact: true })).toHaveCount(3);
  });

  await test.step("Suspend asks first: focus on Cancel, Escape closes it and nothing happens", async () => {
    const boxes = page.getByRole("table").getByRole("checkbox", { name: /^Select (?!every)/ });
    await boxes.nth(0).click();
    const suspend = page.getByRole("toolbar", { name: /Bulk actions, 1 selected/ }).getByRole("button", { name: "Suspend…" });
    await suspend.click();
    const confirm = page.getByRole("dialog", { name: "Suspend 1 account?" });
    await expect(confirm).toBeVisible();
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await expect(confirm.getByRole("list", { name: "Affects" }).getByRole("listitem")).toHaveCount(1);
    await expect(confirm.getByRole("button", { name: "Suspend 1" })).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(confirm).toBeHidden();
    await expect(suspend).toBeFocused();
    await expect(page.getByRole("status").filter({ hasText: /^Suspended/ })).toHaveCount(0);
  });
});
