import { expect, test } from "./fixtures";
import { flipOpsShell, opsLogIn } from "./ops-login";

/**
 * The new Overview, "Waiting on me" (admin redesign B, step 3), behind the same `ops_shell` switch as the shell. The
 * seeded ops data (scripts/seed.ts, SEED_OPS) waits in every area but Safety's privacy: a takedown past its two days
 * (the oldest), an incident due within the hour, a plan request and an Inbox message. Nothing is handled here, so the
 * other ops specs keep their seeded items; the switch goes back off at the end.
 */
test("ops overview: off is today's Overview; on, Waiting on me sorted by due, a filter, Start with the oldest and keys", async ({ page }) => {
  test.setTimeout(240_000);
  await opsLogIn(page);

  await test.step("switch off: today's Overview, unchanged", async () => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Act now" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /waiting on you$/ })).toHaveCount(0);
  });

  await flipOpsShell(page, true);

  const list = page.getByRole("list", { name: "Waiting items" });
  await test.step("switch on: the headline and the list, soonest due first", async () => {
    await page.goto("/admin");
    await expect(page.locator("main h1")).toHaveText(/^\d+ things are waiting on you$/);
    await expect(page.getByRole("heading", { name: "Act now" })).toHaveCount(0);
    await expect(page.getByText(/Oldest: Paper Moons – Night Bus/)).toBeVisible();
    // The list folds after six; the seeded Moderation claim (e2e/ops-moderation.spec.ts) makes more than that.
    const more = page.getByRole("button", { name: /^Show \d+ more$/ });
    if (await more.count()) await more.click();
    const titles = await list.getByRole("listitem").evaluateAll((rows) => rows.map((r) => r.querySelector("span > span")?.textContent ?? ""));
    const at = (t: string) => titles.findIndex((x) => x.startsWith(t));
    expect(at("Paper Moons – Night Bus"), "the late takedown first").toBe(0);
    expect(at("Uploads slow for EU senders")).toBeGreaterThan(at("Paper Moons – Night Bus"));
    expect(at("@oluops")).toBeGreaterThan(at("Uploads slow for EU senders"));
    expect(at("Ina Inbox")).toBeGreaterThan(at("@oluops"));
    await expect(list.getByRole("listitem").first()).toContainText("late");
  });

  await test.step("a filter tab narrows the list to its area", async () => {
    const filters = page.getByRole("group", { name: "Filter waiting items by area" });
    await filters.getByRole("button", { name: /^Platform/ }).click();
    await expect(filters.getByRole("button", { name: /^Platform/ })).toHaveAttribute("aria-pressed", "true");
    const platform = page.getByRole("list", { name: "Waiting items in Platform" });
    await expect(platform.getByRole("listitem").filter({ hasText: "Uploads slow for EU senders" })).toBeVisible();
    await expect(platform.getByRole("listitem").filter({ hasText: "Paper Moons" })).toHaveCount(0);
    await expect(platform.getByRole("listitem").filter({ hasText: "Ina Inbox" })).toHaveCount(0);
    await filters.getByRole("button", { name: /^All/ }).click();
    await expect(list.getByRole("listitem").filter({ hasText: "Ina Inbox" })).toBeVisible();
  });

  await test.step("keys: j moves to the first row, Enter opens it; '?' lists them", async () => {
    await page.locator("main h1").click();
    await page.keyboard.press("j");
    await expect(list.getByRole("listitem").first()).toBeFocused();
    await page.keyboard.press("j");
    await expect(list.getByRole("listitem").nth(1)).toBeFocused();
    await page.keyboard.press("k");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/admin\/takedowns$/);
    await page.goto("/admin");
    await page.locator("main h1").click();
    await page.keyboard.press("?");
    const keys = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(keys.getByText("Next waiting item")).toBeVisible();
    await expect(keys.getByText("Open the selected waiting item")).toBeVisible();
    await page.keyboard.press("Escape");
  });

  await test.step("Start with the oldest opens the oldest item's page", async () => {
    await page.getByRole("link", { name: /^Start with the oldest/ }).click();
    await page.waitForURL(/\/admin\/takedowns$/);
  });

  await flipOpsShell(page, false);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Act now" })).toBeVisible();
});
