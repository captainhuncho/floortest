import type { Page } from "@playwright/test";
import { currentStep, totpCode } from "../src/lib/totp";
import { expect, test } from "./fixtures";

/** Changes to how an account signs in need more than a session: a borrowed or stolen cookie alone can't lock the owner out. */

const PASSWORD = "Correct-Horse-Battery-77";

async function signUp(page: Page, prefix: string) {
  const stamp = Date.now().toString(36);
  await page.goto("/signup");
  await page.getByLabel("Invite code").fill("E2E-INVITE");
  await page.getByLabel("What best describes you?").selectOption("dj");
  await page.getByLabel("First name").fill("Tess");
  await page.getByLabel("Surname").fill("Twostep");
  await page.getByLabel("Username").fill(`${prefix}${stamp}`);
  await page.getByLabel("Email").fill(`${prefix}+${stamp}@example.test`);
  await page.getByRole("textbox", { name: "Password" }).fill(PASSWORD);
  await page.getByRole("checkbox", { name: /18 or over/ }).check();
  await page.getByRole("button", { name: "Create my link" }).click();
  await page.waitForURL(/\/dashboard\/floor/);
}

test("turning on two-factor needs the password, not just a session", async ({ page }) => {
  await signUp(page, "tfa");
  await page.goto("/dashboard/settings/security");
  await page.getByRole("button", { name: "Set up" }).click();
  const key = (await page.locator("p.font-mono").first().innerText()).replace(/\s/g, "");
  const code = page.getByLabel("6-digit code");
  const password = page.getByLabel("Password", { exact: true });
  const turnOn = page.getByRole("button", { name: "Turn on" });

  await code.fill(totpCode(key, currentStep()));
  await expect(turnOn).toBeDisabled();
  await password.fill("not-my-password");
  await turnOn.click();
  await expect(page.getByRole("alert").filter({ hasText: "password isn't right" })).toBeVisible();
  await expect(page.getByText("Save your recovery codes")).toHaveCount(0);

  await password.fill(PASSWORD);
  await turnOn.click();
  await expect(page.getByText("Save your recovery codes")).toBeVisible();
});
