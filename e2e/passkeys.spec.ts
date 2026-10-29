import type { BrowserContext, Page } from "@playwright/test";
import { currentStep, totpCode } from "../src/lib/totp";
import { expect, logIn, submitLogin, test } from "./fixtures";

/**
 * Passkeys with Chrome's virtual authenticator (a software passkey device that always says the person was verified):
 * add one behind the password check, sign in with it alone, use it as the two-step step, and remove it.
 */

const EMAIL = "keys@floortest.test";
const PASSWORD = "floortest-demo";

async function virtualPasskeyDevice(context: BrowserContext, page: Page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  return { cdp, authenticatorId };
}

test("a passkey is added behind the password, signs in on its own, and stops working once removed", async ({ page, context }) => {
  const { cdp, authenticatorId } = await virtualPasskeyDevice(context, page);
  await logIn(page, EMAIL);
  await page.goto("/dashboard/settings/security");
  const section = page.locator("section", { has: page.getByRole("heading", { name: "Passkeys" }) });

  // A session alone isn't enough: the wrong password makes nothing.
  await section.getByRole("button", { name: "Add a passkey" }).click();
  await section.getByLabel("Password").fill("not-my-password");
  await section.getByRole("button", { name: "Continue" }).click();
  await expect(section.getByRole("alert")).toContainText("password isn't right");
  expect((await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials).toHaveLength(0);

  await section.getByLabel("Password").fill(PASSWORD);
  await section.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Passkey added.")).toBeVisible();
  await expect(section.getByRole("listitem")).toHaveCount(1);
  expect((await cdp.send("WebAuthn.getCredentials", { authenticatorId })).credentials).toHaveLength(1);

  // Signed out, the passkey alone signs back in: no email, password or code.
  await context.clearCookies();
  await page.goto("/login");
  const answer = page.waitForRequest((r) => r.method() === "POST" && (r.postData() ?? "").includes("clientDataJSON"));
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await page.waitForURL(/\/dashboard\/floor/);

  // The same answer sent again, with the same cookies, is refused: its challenge was used up the first time.
  const first = await answer;
  const replay = await page.request.post(first.url(), { headers: await first.allHeaders(), data: first.postData() ?? "" });
  expect(await replay.text()).toContain("That passkey didn't work");
  expect(replay.headers()["set-cookie"] ?? "").not.toContain("floortest_session");

  // Removed on the Security page, the same passkey no longer opens the account.
  await page.goto("/dashboard/settings/security");
  await section.getByRole("button", { name: /^Remove / }).click();
  await section.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(section.getByRole("listitem")).toHaveCount(0);
  await context.clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "That passkey didn't work" })).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});

test("with two-step on, a passkey works instead of the code after the password", async ({ page, context }) => {
  await virtualPasskeyDevice(context, page);
  await logIn(page, EMAIL);
  await page.goto("/dashboard/settings/security");
  await page.getByRole("button", { name: "Set up" }).click();
  const key = (await page.locator("p.font-mono").first().innerText()).replace(/\s/g, "");
  await page.getByLabel("6-digit code").fill(totpCode(key, currentStep()));
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Save your recovery codes")).toBeVisible();

  // With two-step on, adding a passkey also needs a code (the next one, since each code works once).
  const section = page.getByRole("region", { name: "Passkeys" });
  await section.getByRole("button", { name: "Add a passkey" }).click();
  await section.getByLabel("Password").fill(PASSWORD);
  await section.getByLabel("Two-step code").fill(totpCode(key, currentStep() + 1));
  await section.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Passkey added.")).toBeVisible();

  await context.clearCookies();
  await page.goto("/login");
  await submitLogin(page, EMAIL, /\/login\/verify/, PASSWORD);
  await page.getByRole("button", { name: "Use a passkey instead" }).click();
  await page.waitForURL(/\/dashboard\/floor/);
});
