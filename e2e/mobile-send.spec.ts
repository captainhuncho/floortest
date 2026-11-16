import { expect, logIn, test } from "./fixtures";

/**
 * Send on the phone (owner, 16 Nov: "Add send to menu bar"): the bottom bar has a Send tab beside Floor, Queue,
 * Collections and Prepare, and all five fit on the smallest phone without the bar running off the screen.
 */
test("the phone bar has a Send tab, and five tabs fit at 320px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/floor");
  const bar = page.getByRole("navigation", { name: "Main" }).and(page.locator("[data-tabbar]"));
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
  // No label spills out of its pill, and each pill stays a comfortable tap target.
  for (const link of await bar.getByRole("link").all()) {
    const fits = await link.evaluate((el) => el.scrollWidth <= el.clientWidth);
    expect(fits).toBe(true);
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});
