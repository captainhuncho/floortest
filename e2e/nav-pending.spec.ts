import type { Locator, Page } from "@playwright/test";
import { expect, hydrated, logIn, test } from "./fixtures";
import { flipOpsShell, opsLogIn } from "./ops-login";

/**
 * Speed fixes, phase 1: a tapped menu item lights up at once (useNavPath.ts), and a page that is slow to arrive shows
 * its loading skeleton (loading.tsx) instead of nothing. The app has no test-only delay, so the slow page is made here:
 * the browser holds back that page's own data request (not the prefetch, which carries the skeleton) for a few seconds.
 */
async function holdBack(page: Page, path: string, ms = 4000) {
  await page.route("**/*", async (route) => {
    const h = route.request().headers();
    if (h.rsc === "1" && !h["next-router-prefetch"] && new URL(route.request().url()).pathname === path) await new Promise((r) => setTimeout(r, ms));
    await route.continue().catch(() => {});
  });
}

/** Clicks `link` and returns how long, measured in the page with performance.now(), until it says it is the current page. */
async function msUntilCurrent(page: Page, link: Locator) {
  await hydrated(link);
  await link.evaluate((a) => {
    const w = window as unknown as { __lit: Promise<number> };
    w.__lit = new Promise<number>((resolve) => {
      let t0 = 0;
      const check = () => {
        if (a.getAttribute("aria-current") !== "page") return;
        mo.disconnect();
        resolve(performance.now() - t0);
      };
      const mo = new MutationObserver(check);
      window.addEventListener("click", () => ((t0 = performance.now()), mo.observe(a, { attributes: true })), { capture: true, once: true });
    });
  });
  await link.click({ noWaitAfter: true });
  return page.evaluate(() => (window as unknown as { __lit: Promise<number> }).__lit);
}

const skeleton = (page: Page) => page.getByRole("status", { name: "Loading" });

test("desk: the tapped menu item lights up within 100 ms, and a slow page shows its skeleton", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/floor");
  await holdBack(page, "/dashboard/review");
  const queue = page.getByRole("navigation", { name: "Main" }).filter({ visible: true }).first().getByRole("link", { name: /^Review Queue/ });
  expect(await msUntilCurrent(page, queue)).toBeLessThan(100);
  await expect(skeleton(page)).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Review Queue" })).toBeVisible({ timeout: 20_000 });
  await expect(skeleton(page)).toHaveCount(0);
  await expect(queue).toHaveAttribute("aria-current", "page");
});

test("ops: today's sidebar and the new shell's panel light the tapped page within 100 ms; slow pages show the skeleton", async ({ page }) => {
  test.setTimeout(300_000);
  await opsLogIn(page);

  await test.step("today's navigation", async () => {
    await page.goto("/admin");
    await holdBack(page, "/admin/accounts");
    const users = page.getByRole("navigation", { name: "Admin", exact: true }).getByRole("link", { name: /^Users/ });
    expect(await msUntilCurrent(page, users)).toBeLessThan(100);
    await expect(skeleton(page)).toBeVisible();
    await expect(page.locator("main h1").first()).toHaveText("Users", { timeout: 20_000 });
    await expect(skeleton(page)).toHaveCount(0);
  });

  await flipOpsShell(page, true);
  try {
    await test.step("the new shell", async () => {
      await page.goto("/admin/inbox");
      await holdBack(page, "/admin/feedback");
      const feedback = page.getByRole("navigation", { name: "Support pages" }).getByRole("link", { name: /^Feedback/ });
      expect(await msUntilCurrent(page, feedback)).toBeLessThan(100);
      await expect(skeleton(page)).toBeVisible();
      await expect(page.locator("main h1").first()).toBeVisible({ timeout: 20_000 });
      await expect(skeleton(page)).toHaveCount(0);
      await expect(feedback).toHaveAttribute("aria-current", "page");
    });
  } finally {
    await flipOpsShell(page, false);
  }
});
