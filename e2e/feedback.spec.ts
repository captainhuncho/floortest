import { expect, logIn, test } from "./fixtures";

/**
 * Feedback reaches the team from a phone (1 Nov: the top-bar button was desktop-only, and Account → Send feedback went
 * to the public contact form as "General"). SHOT_DIR=/some/folder saves a screenshot of each step.
 */
const shot = async (page: import("@playwright/test").Page, name: string) => {
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${name}.png`, fullPage: false });
};

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test("on a phone, the top-bar Feedback button opens the form and sends it, and Account sends in place", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/floor");

  const button = page.getByRole("button", { name: "Feedback", exact: true });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);

  await button.click();
  const panel = page.getByRole("form", { name: "Help shape FloorTest" });
  await expect(panel).toBeVisible();
  // The panel stays on screen at phone width.
  const p = (await panel.boundingBox())!;
  expect(p.x).toBeGreaterThanOrEqual(0);
  expect(p.x + p.width).toBeLessThanOrEqual(390);
  await panel.getByRole("radio", { name: "Bug" }).click();
  await panel.getByRole("textbox", { name: "Feedback" }).fill("The waveform stalls on my phone.");
  await shot(page, "phone-panel");
  await panel.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thanks. It went straight to the FloorTest team.")).toBeVisible();
  await expect(panel).toBeHidden();

  // Account → Send feedback opens the same form under the row, not the public contact page.
  await page.goto("/dashboard/account");
  await page.getByRole("button", { name: /Send feedback/ }).click();
  const inline = page.getByRole("form", { name: "Help shape FloorTest" });
  await inline.getByRole("textbox", { name: "Feedback" }).fill("Love the receipts.");
  await inline.getByRole("radio", { name: "Love it" }).click();
  await inline.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Thanks. It went straight to the FloorTest team.")).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/account/);
});
