import { expect, type Page } from "@playwright/test";
import { logIn, test } from "./fixtures";
import { opsLogIn } from "./ops-login";

const tabBar = (page: Page) => page.getByRole("navigation", { name: "Main" }).and(page.locator("[data-tabbar]"));

/**
 * Send on the phone (owner, 16 Nov: "Add send to menu bar"): the bottom bar has a Send tab beside Floor, Queue,
 * Collections and Prepare, and all five fit on the smallest phone without the bar running off the screen.
 */
test("the phone bar has a Send tab, and five tabs fit at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/floor");
  const bar = tabBar(page);
  const send = bar.getByRole("link", { name: "Send", exact: true });
  await expect(send).toBeVisible();
  await send.click();
  await page.waitForURL(/\/dashboard\/send/);
  await expect(send).toHaveAttribute("aria-current", "page");

  await page.setViewportSize({ width: 320, height: 640 });
  await expect(bar.getByRole("link")).toHaveCount(5);
  const box = (await bar.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  // No label spills out of its pill, and each pill stays a comfortable tap target (44px both ways).
  for (const link of await bar.getByRole("link").all()) {
    const fits = await link.evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(fits).toBe(true);
    const tap = (await link.boundingBox())!;
    expect(tap.height).toBeGreaterThanOrEqual(44);
    expect(tap.width).toBeGreaterThanOrEqual(44);
  }
  // The bar sits above the home bar: its bottom offset follows the safe area.
  expect(await bar.getAttribute("class")).toContain("env(safe-area-inset-bottom)");
});

/** Same rule as the desktop rail: a team member on the team's desk gets no Send tab. */
test("a member on a team desk has no Send tab on the phone bar", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await logIn(page, "listener@floortest.test");
  await page.getByText("Switch desk").click();
  await page.getByRole("button", { name: /Tia Teams/ }).click();
  await expect(page.getByText(/On Tia Teams.s desk as a member/)).toBeVisible();
  await expect(tabBar(page).getByRole("link", { name: "Floor", exact: true })).toBeVisible();
  await expect(tabBar(page).getByRole("link", { name: "Send", exact: true })).toHaveCount(0);
});

/** With "Send music between desks" off (as in the beta) nobody gets the tab; turned back on, it returns. */
test("the Send tab hides while send_music is off", async ({ page, browser }) => {
  const ops = await browser.newPage();
  const flip = async (on: boolean) => {
    await ops.goto("/admin/switches");
    const row = ops.getByRole("listitem").filter({ hasText: "Send music between desks" });
    await row.getByRole("button", { name: `${on ? "Turn on" : "Turn off"} Send music between desks` }).click();
    await ops.locator("dialog[open]").getByRole("button", { name: on ? "Turn on" : "Turn off" }).click();
    await expect(row.getByText(on ? "On" : "Off", { exact: true })).toBeVisible();
  };
  await opsLogIn(ops);
  await flip(false);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await logIn(page, "demo@floortest.test");
    await page.goto("/dashboard/floor");
    await expect(tabBar(page).getByRole("link", { name: "Floor", exact: true })).toBeVisible();
    await expect(tabBar(page).getByRole("link", { name: "Send", exact: true })).toHaveCount(0);
  } finally {
    await flip(true);
    await ops.close();
  }
});
