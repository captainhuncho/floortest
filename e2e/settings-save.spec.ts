import { expect, hydrated, logIn, test } from "./fixtures";

// The owner's own alert and contact choices are saved as the person (B8, migration 0132). This journey saves them for
// real, consent included, so a missing database grant can't hide behind unit tests (Safety review of #448, 5 Nov).
test("the owner saves alerts and a newsletter consent, and they stick", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/settings/notifications");
  const saveButton = () => page.getByRole("button", { name: "Save", exact: true });
  await hydrated(saveButton());
  const newsletter = () => page.locator('input[name="notify_product"]');
  const was = await newsletter().isChecked();
  const save = async () => {
    await saveButton().click();
    await expect(page.getByRole("status").filter({ hasText: "Saved" })).toBeVisible();
  };
  // Flip the newsletter, save, and see it kept after a reload.
  await newsletter().locator("xpath=..").click();
  await save();
  await page.reload();
  await hydrated(saveButton());
  await expect(newsletter()).toBeChecked({ checked: !was });
  // Put it back as it was, through the same save.
  await newsletter().locator("xpath=..").click();
  await save();
  await page.reload();
  await hydrated(saveButton());
  await expect(newsletter()).toBeChecked({ checked: was });
});
