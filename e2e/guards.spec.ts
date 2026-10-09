import { expect, test } from "@playwright/test";

/** Security behaviour a visitor can see from outside, checked in a real browser. */

test("sign-up never says whether an email already has an account", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Invite code").fill("E2E-INVITE");
  await page.getByLabel("What best describes you?").selectOption("dj");
  await page.getByLabel("First name").fill("Someone");
  await page.getByLabel("Surname").fill("Else");
  await page.getByLabel("Username").fill(`taken${Date.now().toString(36)}`);
  await page.getByLabel("Email").fill("demo@floortest.test"); // the seeded receiver's email
  await page.getByRole("textbox", { name: "Password" }).fill("Correct-Horse-Battery-77");
  await page.getByRole("checkbox", { name: /18 or over/ }).check();
  await page.getByRole("button", { name: "Create my link" }).click();
  const message = page.getByRole("alert").filter({ hasText: /\S/ }).first();
  await expect(message).toContainText("We couldn't create an account with those details");
  await expect(message).not.toContainText(/exists|already registered/i);
});

test("the on-page site editor refuses anyone without a live ops session", async ({ request }) => {
  const save = await request.post("/api/site-edit", { data: { page: "home", values: { headline: "Hacked" }, publish: true } });
  expect(save.status()).toBe(403);
  const upload = await request.post("/api/site-edit/image", { multipart: { file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("x") } } });
  expect(upload.status()).toBe(403);
});

test("visitors never get editing markup on public pages", async ({ page }) => {
  for (const path of ["/", "/pricing", "/maxwell", "/login"]) {
    await page.goto(path);
    await expect(page.locator("[data-edit], [data-edit-panel], [data-site-editor-ui]")).toHaveCount(0);
  }
});
