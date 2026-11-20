import { expect, test } from "@playwright/test";
import { POSTHOG_REQUESTS } from "./fixtures";

/**
 * PostHog loads only after Accept on the cookie banner (owner's rule): before a choice and after "Not now" the page makes
 * no request to PostHog and stores nothing of its own. PostHog is answered locally; the e2e key is made up.
 */
async function watch(page: import("@playwright/test").Page) {
  const seen: string[] = [];
  await page.route(POSTHOG_REQUESTS, (route) => {
    seen.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  return seen;
}

const phStorage = (page: import("@playwright/test").Page) =>
  page.evaluate(() => [...Object.keys(localStorage), ...document.cookie.split(";").map((c) => c.split("=")[0].trim())].filter((k) => /^(ph_|__ph)/.test(k)));

test("nothing before a choice, nothing after Not now", async ({ page }) => {
  const seen = await watch(page);
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Not now" })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(seen).toEqual([]);
  expect(await phStorage(page)).toEqual([]);
  await page.getByRole("button", { name: "Not now" }).click();
  await page.reload();
  await page.waitForTimeout(1500);
  expect(seen).toEqual([]);
  expect(await phStorage(page)).toEqual([]);
});

test("after Accept, events go to PostHog's EU host only", async ({ page }) => {
  const seen = await watch(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Accept" }).click();
  await expect.poll(() => seen.length, { timeout: 20_000 }).toBeGreaterThan(0);
  for (const url of seen) expect(new URL(url).host).toBe("eu.i.posthog.com");
});
