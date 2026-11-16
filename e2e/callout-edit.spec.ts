import { expect, logIn, test } from "./fixtures";

/**
 * Editing a callout (owner, 16 Nov): once the form is open there's no Edit button to tap again; Save and Cancel sit at
 * the end, after the artwork, and both close the pop-up.
 */
test("the callout edit pop-up ends with Save and Cancel, after the artwork, and both close it", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/collections/2");

  await page.getByRole("button", { name: "Edit collection" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Edit", exact: true })).toHaveCount(0);
  const save = dialog.getByRole("button", { name: "Save", exact: true });
  const art = dialog.getByText("Artwork (optional)");
  await expect(save).toBeVisible();
  expect((await save.boundingBox())!.y).toBeGreaterThan((await art.boundingBox())!.y);

  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);

  // Save keeps the name as it is (other specs use it) and closes the pop-up once it has saved.
  await page.getByRole("button", { name: "Edit collection" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
