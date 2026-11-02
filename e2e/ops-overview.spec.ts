import { expect, hydrated, test } from "./fixtures";
import { flipOpsShell, opsLogIn } from "./ops-login";

/**
 * Overview is the same page in both navigations (owner, 2 Nov: "bring back the overview page"). With `ops_shell` on, the
 * rail, top bar and phone bar frame today's Overview; the step-3/step-6 "Waiting on me" Overview and its Live card stay
 * in code (src/app/admin/overview) but /admin no longer shows them. The switch goes back off at the end.
 */
test("ops overview: today's Overview with the switch off and on, inside the new frame when on", async ({ page }) => {
  test.setTimeout(240_000);
  await opsLogIn(page);

  await test.step("switch off: today's Overview", async () => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Act now" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Ops areas" })).toHaveCount(0);
  });

  await flipOpsShell(page, true);
  try {
    await test.step("switch on: the same Overview inside the rail and top bar, once, with no Waiting on me list or Live card", async () => {
      await page.goto("/admin");
      await expect(page.getByRole("navigation", { name: "Ops areas" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Act now" })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Tracks received" })).toBeVisible();
      await expect(page.locator("main h1")).toHaveCount(1);
      await expect(page.locator("main h1")).not.toHaveText(/things are waiting on you$/);
      await expect(page.getByRole("list", { name: "Waiting items" })).toHaveCount(0);
      await expect(page.getByRole("region", { name: "Live" })).toHaveCount(0);
      // After a reload the page is still there once (the #338 lesson: no doubled tree).
      await page.reload();
      await expect(page.getByRole("heading", { name: "Act now" })).toHaveCount(1);
      await expect(page.locator("main")).toHaveCount(1);
    });
  } finally {
    await flipOpsShell(page, false);
  }
});

/**
 * Skipped (owner, 2 Nov): /admin shows today's Overview with ops_shell on too, so "Waiting on me" and its Live card are
 * not rendered anywhere. Kept, not deleted, so it can come back if that Overview is shown again.
 *
 * The new Overview, "Waiting on me" (admin redesign B, step 3), behind the same `ops_shell` switch as the shell. The
 * seeded ops data (scripts/seed.ts, SEED_OPS) waits in every area but Safety's privacy: a takedown past its two days
 * (the oldest), an incident due within the hour, a plan request and an Inbox message. Nothing is handled here, so the
 * other ops specs keep their seeded items; the switch goes back off at the end.
 */
test.skip("ops overview: off is today's Overview; on, Waiting on me sorted by due, a filter, Start with the oldest and keys", async ({ page }) => {
  test.setTimeout(240_000);
  await opsLogIn(page);

  await test.step("switch off: today's Overview, unchanged", async () => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { name: "Act now" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /waiting on you$/ })).toHaveCount(0);
  });

  await flipOpsShell(page, true);
  try {

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

    await test.step("Live: the seeded activity, newest first, each row linking to its page", async () => {
      await page.goto("/admin");
      const card = page.getByRole("region", { name: "Live" });
      const rows = card.getByRole("list", { name: "Recent activity" }).getByRole("link");
      await expect(rows.first()).toBeVisible();
      // Each row links to its page: the account (sign-ups, first tracks), Takedowns or the admin log. The other ops specs'
      // admin actions are the newest, so which kinds fill the eight rows depends on what ran before.
      for (const href of await rows.evaluateAll((as) => as.map((a) => a.getAttribute("href")))) expect(href).toMatch(/^\/admin\/(accounts\/\d+|takedowns|log)$/);
      const times = await card.locator("time").evaluateAll((ts) => ts.map((t) => Date.parse(t.getAttribute("datetime")!)));
      expect(times, "newest first").toEqual([...times].sort((a, b) => b - a));
      await expect(card.getByRole("button", { name: "Announce" })).toHaveAttribute("aria-pressed", "false");
    });

    await test.step("Live: asks every 30 s, not while the tab is hidden or paused, and again once visible", async () => {
      await page.clock.install();
      let asks = 0;
      page.on("request", (r) => void (r.url().endsWith("/api/admin/feed") && asks++));
      await page.goto("/admin");
      const card = page.getByRole("region", { name: "Live" });
      const pause = card.getByRole("button", { name: "Pause live activity" });
      await hydrated(pause);
      await card.scrollIntoViewIfNeeded();
      // The fake clock also moves with real time, and the dev server can be slow to hydrate, so the counts are relative and
      // the "not yet" check stops short of 30 s.
      await page.clock.runFor(25_000);
      expect(asks, "nothing before 30 s").toBe(0);
      await page.clock.runFor(40_000);
      await expect.poll(() => asks).toBeGreaterThanOrEqual(1);

      const setHidden = (hidden: boolean) =>
        page.evaluate((h) => {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
          document.dispatchEvent(new Event("visibilitychange"));
        }, hidden);
      await setHidden(true);
      const hiddenAt = asks;
      await page.clock.runFor(95_000);
      expect(asks, "no asking while the tab is hidden").toBe(hiddenAt);
      await setHidden(false);
      await page.clock.runFor(100);
      await expect.poll(() => asks, { message: "visible again after the interval passed: asks at once" }).toBe(hiddenAt + 1);

      await pause.click();
      await expect(card.getByRole("button", { name: "Resume live activity" })).toBeVisible();
      await expect(card.getByText("Paused", { exact: true })).toBeVisible();
      const pausedAt = asks;
      await page.clock.runFor(95_000);
      expect(asks, "no asking while paused").toBe(pausedAt);
      await card.getByRole("button", { name: "Resume live activity" }).click();
      await page.clock.runFor(100);
      await expect.poll(() => asks).toBe(pausedAt + 1);
    });

  } finally {
    await page.clock.resume().catch(() => {});
    await flipOpsShell(page, false);
  }
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Act now" })).toBeVisible();
});
