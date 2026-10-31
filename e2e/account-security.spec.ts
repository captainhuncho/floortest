import type { Page } from "@playwright/test";
import { currentStep, totpCode } from "../src/lib/totp";
import { expect, logIn, submitLogin, test, TEST_PASSWORD, signUp as guidedSignUp } from "./fixtures";

/** Changes to how an account signs in need more than a session: a borrowed or stolen cookie alone can't lock the owner out. */

const PASSWORD = "Correct-Horse-Battery-77";

async function signUp(page: Page, prefix: string) {
  const stamp = Date.now().toString(36);
  await guidedSignUp(page, { kind: "DJ", first: "Tess", last: "Twostep", handle: `${prefix}${stamp}`, email: `${prefix}+${stamp}@example.test`, password: PASSWORD });
  return `${prefix}+${stamp}@example.test`;
}

test("turning on two-factor needs a confirmed email and the password, not just a session", async ({ page, context }) => {
  // A new account's email isn't confirmed: whoever made it may not own the address, so two-factor waits.
  await signUp(page, "tfa");
  await page.goto("/dashboard/settings/security");
  await page.getByRole("button", { name: "Set up" }).click();
  let key = (await page.locator("p.font-mono").first().innerText()).replace(/\s/g, "");
  await page.getByLabel("6-digit code").fill(totpCode(key, currentStep()));
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Confirm your email first" })).toBeVisible();
  await expect(page.getByText("Save your recovery codes")).toHaveCount(0);

  // A confirmed account turns it on, but only with its password.
  await context.clearCookies();
  await logIn(page, "tfa@floortest.test");
  await page.goto("/dashboard/settings/security");
  await page.getByRole("button", { name: "Set up" }).click();
  key = (await page.locator("p.font-mono").first().innerText()).replace(/\s/g, "");
  const code = page.getByLabel("6-digit code");
  const password = page.getByLabel("Password", { exact: true });
  const turnOn = page.getByRole("button", { name: "Turn on" });

  await code.fill(totpCode(key, currentStep()));
  await expect(turnOn).toBeDisabled();
  await password.fill("not-my-password");
  await turnOn.click();
  await expect(page.getByRole("alert").filter({ hasText: "password isn't right" })).toBeVisible();
  await expect(page.getByText("Save your recovery codes")).toHaveCount(0);

  await password.fill(TEST_PASSWORD);
  await turnOn.click();
  await expect(page.getByText("Save your recovery codes")).toBeVisible();
});

test("the Security page lists every signed-in device, and signing one out ends it at once", async ({ page, browser }) => {
  const email = await signUp(page, "devices");
  // The same account signs in on a second browser.
  const other = await browser.newContext();
  const phone = await other.newPage();
  await phone.goto("/login");
  await submitLogin(phone, email, /\/dashboard\/floor/, PASSWORD);

  await page.goto("/dashboard/settings/security");
  const devices = page.getByRole("list", { name: "Devices signed in" }).getByRole("listitem");
  await expect(devices).toHaveCount(2);
  await expect(devices.filter({ hasText: "This device" })).toHaveCount(1);
  await expect(page.getByText("Signed in on 1 other device.")).toBeVisible();

  await devices.filter({ hasNotText: "This device" }).getByRole("button", { name: "Sign out" }).click();
  await expect(devices).toHaveCount(1);
  await expect(page.getByText("Only signed in on this device.")).toBeVisible();
  // The other browser is out on its next request; this one keeps working.
  await phone.goto("/dashboard/settings/security");
  await phone.waitForURL(/\/login/);
  await page.reload();
  await expect(devices).toHaveCount(1);
  await other.close();
});
