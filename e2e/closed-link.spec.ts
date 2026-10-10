import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

/**
 * A sender who hits a closed link leaves their email; when the receiver reopens the link, one email goes out.
 * The receiver pauses from Account, the sender asks on the public page, the receiver resumes and the email shows
 * under Account → Emails to senders (nothing is really delivered: the e2e server has no mail key).
 * Runs before guards.spec.ts, which puts the demo account behind the human check.
 */
test.describe.configure({ mode: "serial" });

const email = `reopen+${Date.now().toString(36)}@example.test`;

async function logIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@floortest.test");
  await page.getByRole("textbox", { name: "Password" }).fill("floortest-demo");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard\//);
}

// Whatever happens above, the demo link is open again for the specs that follow.
test.afterAll(async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await logIn(page);
  await page.goto("/dashboard/account");
  const sw = page.getByRole("switch", { name: "Taking submissions" });
  if ((await sw.getAttribute("aria-checked")) === "false") {
    await sw.click();
    await expect(page.getByText("Submissions reopened")).toBeVisible();
  }
  await ctx.close();
});

test("the receiver pauses their link", async ({ page }) => {
  await logIn(page);
  await page.goto("/dashboard/account");
  const sw = page.getByRole("switch", { name: "Taking submissions" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(page.getByText("Submissions paused")).toBeVisible();
});

test("a sender asks to hear when it reopens", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/maxwell");
  await expect(page.getByText(/taking a break from submissions/)).toBeVisible();
  await page.getByLabel("Email me when it reopens").fill(email);
  await page.getByRole("button", { name: "Tell me" }).click();
  await expect(page.getByText(/one email when Maxwell/)).toBeVisible();
  await ctx.close();
});

test("resuming the link sends the one email", async ({ page }) => {
  await logIn(page);
  await page.goto("/dashboard/account");
  await page.getByRole("switch", { name: "Taking submissions" }).click();
  await expect(page.getByText("Submissions reopened")).toBeVisible();
  await page.goto("/dashboard/emails");
  const row = page.locator("summary", { hasText: `to ${email}` });
  await expect(row).toContainText("is taking music again");
  // Reopening again later sends nothing more: the request was used up.
  await page.goto("/dashboard/account");
  await page.getByRole("switch", { name: "Taking submissions" }).click();
  await expect(page.getByText("Submissions paused")).toBeVisible();
  await page.getByRole("switch", { name: "Taking submissions" }).click();
  await expect(page.getByText("Submissions reopened")).toBeVisible();
  await page.goto("/dashboard/emails");
  await expect(page.locator("summary", { hasText: `to ${email}` })).toHaveCount(1);
});
