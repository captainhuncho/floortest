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
  const sw = page.getByRole("switch", { name: "Link open" });
  if ((await sw.getAttribute("aria-checked")) === "false") {
    await sw.click();
    await expect(page.getByText("Link open again")).toBeVisible();
  }
  await ctx.close();
});

test("the receiver pauses their link", async ({ page }) => {
  await logIn(page);
  await page.goto("/dashboard/account");
  const sw = page.getByRole("switch", { name: "Link open" });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(page.getByText("Link paused")).toBeVisible();
});

test("a sender asks to hear when it reopens", async ({ page }) => {
  // The page fixture carries the stand-in bot check; signed out, it's any sender.
  await page.context().clearCookies();
  await page.goto("/maxwell");
  await expect(page.getByText(/taking a break from submissions/)).toBeVisible();
  await page.getByRole("textbox", { name: "Email me when it reopens" }).fill(email);
  await expect(page.getByTestId("turnstile")).toBeAttached(); // the bot check mounts on first focus
  await page.getByRole("button", { name: "Tell me" }).click();
  await expect(page.getByText(/one email when Maxwell/)).toBeVisible();
});

test("resuming the link emails no one who hasn't confirmed", async ({ page }) => {
  // The request only sent a confirmation link (H76): until it's opened, a typed address gets no reopen email, so the
  // form can't be used to mail strangers. Confirmed requests get exactly one (tests/reopen-confirm.test.ts).
  await logIn(page);
  await page.goto("/dashboard/account");
  await page.getByRole("switch", { name: "Link open" }).click();
  await expect(page.getByText("Link open again")).toBeVisible();
  await page.goto("/dashboard/emails");
  await expect(page.locator("summary", { hasText: `to ${email}` })).toHaveCount(0);
});
