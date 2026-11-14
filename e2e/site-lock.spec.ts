import { expect, test, type Browser, type Page } from "@playwright/test";
import { logIn } from "./fixtures";
import { opsLogIn } from "./ops-login";

/**
 * The coming-soon gate with a site password set (owner, 14 Nov: signed-in people keep working when the site re-locks).
 * Runs only in its own pass, `npm run e2e:site-lock`, which starts the test copy with SITE_PASSWORD set; the main run
 * has no password, so every other spec sees an open site.
 */
test.skip(!process.env.E2E_SITE_LOCK, "runs only in npm run e2e:site-lock (SITE_PASSWORD set)");

const SITE_PASSWORD = "e2e-gate-password";
const SITE_LOCK = "Site lock (coming soon)";

// The gate shows the coming-soon page in place (a rewrite), so the address stays the one asked for.
const soon = (page: Page) => page.getByRole("heading", { name: "Coming soon" });

async function comingSoon(page: Page, path = "/dashboard/floor") {
  await page.goto(path);
  await expect(soon(page)).toBeVisible();
}

async function unlock(page: Page) {
  await page.goto("/coming-soon");
  await page.getByLabel("Have the password?").fill(SITE_PASSWORD);
  await page.getByRole("button", { name: "Enter" }).click();
  await expect(page.getByLabel("Have the password?")).toHaveCount(0);
}

/** Turns the lock off and on again from Feature switches, as the super admin: a new lock generation, so every pass made before it stops working. */
async function relock(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await unlock(page);
  await opsLogIn(page);
  for (const on of [false, true]) {
    await page.goto("/admin/switches");
    // After the lock comes back on, this browser's own pass is from the old generation: unlock again to reach admin.
    if (await soon(page).count()) {
      await unlock(page);
      await page.goto("/admin/switches");
    }
    const row = page.getByRole("listitem").filter({ hasText: SITE_LOCK });
    await row.getByRole("button", { name: `${on ? "Turn on" : "Turn off"} ${SITE_LOCK}` }).click();
    await page.locator("dialog[open]").getByRole("button", { name: on ? "Turn on" : "Turn off" }).click();
    await expect(row.getByText(on ? "On" : "Off", { exact: true })).toBeVisible();
  }
  await ctx.close();
}

test("site lock: signed out sees Coming soon, signed in passes, and a re-lock keeps the signed-in person in", async ({ browser }) => {
  const visitor = await browser.newContext();
  const vPage = await visitor.newPage();
  const member = await browser.newContext();
  const mPage = await member.newPage();

  await test.step("signed out: Coming soon on a private page", async () => {
    await comingSoon(vPage);
  });

  await test.step("a wrong password is refused and the page stays locked", async () => {
    await vPage.getByLabel("Have the password?").fill("not-the-password");
    await vPage.getByRole("button", { name: "Enter" }).click();
    await expect(vPage.getByText("That password isn't right.")).toBeVisible();
    await comingSoon(vPage);
  });

  await test.step("the password lets a signed-out visitor in", async () => {
    await unlock(vPage);
    await vPage.goto("/");
    await expect(soon(vPage)).toHaveCount(0);
  });

  await test.step("signed in (the log-in page stays open while locked): the desk loads with no password", async () => {
    await logIn(mPage, "demo@floortest.test");
    await mPage.goto("/dashboard/floor");
    await expect(mPage).toHaveURL(/\/dashboard\/floor/);
  });

  await test.step("signed out, a real track's download and audio and the export answer 401 (the gate leaves /api to each route's own sign-in check)", async () => {
    // A track that exists: the first one the signed-in member can play.
    let id = 0;
    for (let n = 1; n <= 30 && !id; n++) if ([200, 206, 302].includes((await mPage.request.get(`/api/tracks/${n}/audio`, { maxRedirects: 0 })).status())) id = n;
    expect(id, "found a track the member can play").toBeGreaterThan(0);
    // Same-site, so the request gets past the other-site check and reaches the sign-in check.
    const headers = { "sec-fetch-site": "same-origin" };
    for (const path of [`/api/tracks/${id}/download`, `/api/tracks/${id}/audio`, "/api/export"]) {
      const res = await vPage.request.get(path, { maxRedirects: 0, headers });
      expect(res.status(), `${path} signed out`).toBe(401);
      expect(res.headers()["content-type"] ?? "", `${path} sends no file`).not.toMatch(/audio|zip|octet-stream|csv/);
    }
  });

  await test.step("re-lock from Feature switches", async () => {
    await relock(browser);
  });

  await test.step("after the re-lock: the old password pass no longer works (within the 5 s lock cache)", async () => {
    await expect
      .poll(async () => {
        await vPage.goto("/dashboard/floor");
        return soon(vPage).count();
      }, { timeout: 20_000, intervals: [1_000] })
      .toBe(1);
  });

  await test.step("after the re-lock: the signed-in person keeps working", async () => {
    await mPage.goto("/dashboard/floor");
    await expect(mPage).toHaveURL(/\/dashboard\/floor/);
    await expect(soon(mPage)).toHaveCount(0);
  });

  await test.step("a fresh signed-out browser still sees Coming soon", async () => {
    const fresh = await browser.newContext();
    await comingSoon(await fresh.newPage());
    await fresh.close();
  });

  await visitor.close();
  await member.close();
});
