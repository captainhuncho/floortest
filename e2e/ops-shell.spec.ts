import type { Page } from "@playwright/test";
import { expect, hydrated, test } from "./fixtures";
import { flipOpsShell, opsLogIn } from "./ops-login";
import { AREAS } from "../src/app/admin/shell/model";

/**
 * The new ops shell (admin redesign B, step 2) behind the `ops_shell` switch. With it off, ops is today's top tabs and
 * sidebar; on, those are gone and the rail, panel and top bar (phones: the bottom bar and More) reach every page. One
 * sign-in for all of it (a fresh two-step code can take half a minute), and the switch goes back off at the end.
 */
const flip = flipOpsShell;

const oldNav = (page: Page) => page.getByRole("navigation", { name: "Admin areas" });
const rail = (page: Page) => page.getByRole("navigation", { name: "Ops areas" });

test("ops shell: off is today's navigation; on, the rail and panel reach every page, badges, phone bar and More", async ({ page }) => {
  test.setTimeout(600_000);
  await opsLogIn(page);

  await test.step("switch off: today's top tabs and sidebar, and no rail", async () => {
    await page.goto("/admin");
    await expect(oldNav(page).getByRole("link")).toHaveText([/^Overview/, /^Support/, /^Growth/, /^Product/, /^Trust & safety/, /^Platform/, /^Admin/]);
    await expect(page.getByRole("navigation", { name: "Admin", exact: true })).toBeVisible();
    await expect(rail(page)).toHaveCount(0);
  });

  await flip(page, true);

  await test.step("switch on: one navigation, and every page in today's menu opens from the rail and the panel", async () => {
    await page.goto("/admin");
    await expect(rail(page)).toBeVisible();
    await expect(oldNav(page)).toHaveCount(0);
    await expect(page.getByRole("navigation", { name: "Admin", exact: true })).toHaveCount(0);
    for (const area of AREAS) {
      for (const page_ of area.sections.flatMap((s) => s.pages)) {
        const item = rail(page).getByRole(area.id === "overview" ? "link" : "button", { name: new RegExp(`^${area.title}(, \\d+ waiting)?$`) });
        // After each page load the rail re-hydrates; a click before React owns the button does nothing (seen 2 Nov).
        await hydrated(item);
        await item.click();
        if (area.id !== "overview") {
          await expect(item).toHaveAttribute("aria-pressed", "true");
          await page.getByRole("navigation", { name: `${area.title} pages` }).getByRole("link", { name: new RegExp(`^${page_.label}\\b`) }).click();
        }
        await page.waitForURL((u) => u.pathname === page_.href);
        expect((await page.reload())?.status(), page_.href).toBe(200);
        await expect(page.locator("main h1").first(), page_.href).toBeVisible();
        await expect(page.getByRole("navigation", { name: "Breadcrumb" }).locator('[aria-current="page"]')).toHaveText(page_.label);
      }
    }
  });

  await test.step("badges: each area says how many wait, the sum of its pages' counts", async () => {
    await page.goto("/admin/inbox");
    const support = rail(page).getByRole("button", { name: /^Support/ });
    const inbox = page.getByRole("navigation", { name: "Support pages" }).getByRole("link", { name: /^Inbox/ });
    const counted = Number((await inbox.textContent())?.match(/(\d+) waiting/)?.[1] ?? 0);
    expect(counted, "the seeded inbox message waits").toBeGreaterThan(0);
    await expect(support).toHaveAccessibleName(`Support, ${counted} waiting`);
    await expect(inbox).toHaveAttribute("aria-current", "page");
  });

  await test.step("keyboard: g then s opens Support, ⌘K from the top bar opens search", async () => {
    await page.goto("/admin");
    await page.locator("main h1").first().click();
    await page.keyboard.press("g");
    await page.keyboard.press("s");
    await page.waitForURL(/\/admin\/inbox$/);
    await page.getByRole("banner").getByRole("button", { name: /Search/ }).click();
    const palette = page.getByRole("dialog", { name: "Search people, pages and actions" });
    await expect(palette).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette).toBeHidden();
  });

  await test.step("phone: the bottom bar and the More sheet", async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/admin");
    await expect(rail(page)).toBeHidden();
    const bar = page.getByRole("navigation", { name: "Ops shortcuts" });
    await expect(bar.getByRole("listitem")).toHaveCount(5);
    await expect(bar.getByRole("link", { name: /^Waiting/ })).toHaveAttribute("aria-current", "page");
    await expect(bar.getByRole("link", { name: /^Inbox, \d+ waiting$/ })).toBeVisible();
    await expect(bar.getByRole("link", { name: "Users" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    const more = bar.getByRole("button", { name: "More" });
    await more.click();
    const sheet = page.getByRole("dialog", { name: "All pages" });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("link")).toHaveCount(AREAS.flatMap((a) => a.sections.flatMap((s) => s.pages)).length);
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(more).toBeFocused();
    await more.click();
    await sheet.getByRole("link", { name: /^Moderation/ }).click();
    await page.waitForURL(/\/admin\/moderation$/);
    await expect(sheet).toBeHidden();
    await bar.getByRole("button", { name: "Search" }).click();
    await expect(page.getByRole("dialog", { name: "Search people, pages and actions" })).toBeVisible();
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  await flip(page, false);

  await test.step("switch off again: today's navigation is back, unchanged", async () => {
    await page.goto("/admin");
    await expect(oldNav(page).getByRole("link")).toHaveCount(7);
    await expect(rail(page)).toHaveCount(0);
  });
});
