import { expect, test } from "./fixtures";

/** Batch actions in the List view, on the seeded receiver's own tracks: decide, move and delete several at once. */
test("select tracks in the list and act on them together", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@floortest.test");
  await page.getByRole("textbox", { name: "Password" }).fill("floortest-demo");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard\//);
  await page.goto("/dashboard/review?view=list&s=all");

  const pick = async (...names: string[]) => {
    await page.getByRole("button", { name: "Select", exact: true }).click();
    for (const n of names) await page.getByRole("checkbox", { name: `Select ${n}` }).check();
  };
  const bar = page.getByRole("region", { name: "Selected tracks" });
  const toast = (text: string | RegExp) => expect(page.getByText(text).first()).toBeVisible();

  // Not for me on two, then both back to Needs review.
  await pick("Kojo Tetteh - Lagoon Drive", "Ama Mensah - Coastline (Dub)");
  await expect(bar).toContainText("2 selected");
  await bar.getByRole("button", { name: "Not for me" }).click();
  await toast(/Not for me: \d tracks?/);
  await pick("Kojo Tetteh - Lagoon Drive", "Ama Mensah - Coastline (Dub)");
  await bar.getByRole("button", { name: "Needs review" }).click();
  await toast("2 tracks back in Needs review");

  // Move both into another collection.
  await pick("Kojo Tetteh - Lagoon Drive", "Ama Mensah - Coastline (Dub)");
  await bar.getByRole("combobox", { name: "Move to collection" }).selectOption({ label: "Villagers callout" });
  await toast(/Moved \d tracks? to Villagers callout/);

  // Download the selection as one ZIP (only your own tracks; a stranger's id in the link is ignored).
  await pick("Kojo Tetteh - Lagoon Drive", "Ama Mensah - Coastline (Dub)");
  const href = await bar.getByRole("link", { name: "Download" }).getAttribute("href");
  const zip = await page.request.get(href!);
  expect(zip.status()).toBe(200);
  expect(zip.headers()["content-type"]).toBe("application/zip");
  expect((await page.request.get("/api/export?ids=999999&files=1")).status()).toBe(400);

  // Delete asks first; Cancel changes nothing, then Delete removes both.
  await bar.getByRole("button", { name: "Delete" }).click();
  await bar.getByRole("button", { name: "Cancel" }).click();
  await bar.getByRole("button", { name: "Delete" }).click();
  await bar.getByRole("button", { name: "Delete 2 tracks" }).click();
  await toast("Deleted 2 tracks");
  await page.reload();
  await expect(page.getByText("Lagoon Drive")).toHaveCount(0);
  await expect(page.getByText("Coastline (Dub)")).toHaveCount(0);
});
