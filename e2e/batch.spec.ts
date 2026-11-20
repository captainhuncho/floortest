import { expect, hydrated, test, wav } from "./fixtures";

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

/** The review card shows what the decision needs; the track's facts and the sender wait behind Info, Delete in More. */
test("the review card keeps the decision in view: facts and the sender behind Info, Delete only in More", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@floortest.test");
  await page.getByRole("textbox", { name: "Password" }).fill("floortest-demo");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard\//);
  await page.goto("/dashboard/review?view=queue"); // Needs review: the panel offers Keep (a kept track shows "Kept")

  const panel = page.getByRole("complementary", { name: "Review" });
  await expect(panel.getByRole("button", { name: /^Keep/ }).locator("visible=true").first()).toBeVisible();
  await expect(panel.getByText(/\d+ BPM ·/).locator("visible=true").first()).toBeVisible();

  // Option 1 (owner, 20 Nov): no fold, and nothing on the card moves, reports or deletes a track.
  await expect(panel.locator("details[data-panel-details]")).toHaveCount(0);
  await expect(panel.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await expect(panel.getByText("Full history →")).toBeHidden();
  // Info opens the track's facts beside the card; the sender's record is its second tab.
  const info = panel.getByRole("button", { name: "Track and sender info" });
  await hydrated(info);
  await info.click();
  await expect(info).toHaveAttribute("aria-expanded", "true");
  const drawer = panel.getByRole("complementary", { name: "Track and sender info" });
  await expect(drawer.getByText("Format")).toBeVisible();
  await drawer.getByRole("tab", { name: "Sender" }).click();
  await expect(drawer.getByText("Full history →")).toBeVisible();
  // Delete is the last item in More.
  await panel.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("menu", { name: "More" }).getByRole("menuitem").last()).toHaveText("Delete");
  await page.keyboard.press("Escape");
  // Put Info away again: open or closed is remembered on this device.
  await info.click();
  await expect(drawer).toBeHidden();
});

/** The owner adds their own file on Projects (1b); a callout page has no Add tracks; strangers are refused. */
test("the owner adds a WAV on Projects, not from a callout page; strangers and other collections are refused", async ({ page, browser }) => {
  // Signed out: refused.
  const anon = await browser.newContext();
  expect((await anon.request.post(`http://localhost:${process.env.E2E_PORT || 3210}/api/collections/2/upload`, { data: { fileName: "x.wav", size: 10, title: "X", rights: true } })).status()).toBe(401);
  await anon.close();

  await page.goto("/login");
  await page.getByLabel("Email").fill("demo@floortest.test");
  await page.getByRole("textbox", { name: "Password" }).fill("floortest-demo");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL(/\/dashboard\//);
  // A collection that isn't theirs (or doesn't exist): not found.
  expect((await page.request.post("/api/collections/999999/upload", { data: { fileName: "x.wav", size: 10, title: "X", rights: true } })).status()).toBe(404);

  // A callout page has no Add tracks (owner, 16 Nov: Projects only); your own files are added on Projects.
  await page.goto("/dashboard/collections/2");
  await expect(page.getByRole("button", { name: "Add tracks" })).toHaveCount(0);
  await page.goto("/dashboard/projects");
  // Upload audio opens the file picker from a React handler, so a click before the page has hydrated does nothing (the
  // 17 Nov #596 run timed out that way under load). Click until the picker really opens, then hand it the file once.
  await expect(async () => {
    const chooser = page.waitForEvent("filechooser", { timeout: 3_000 });
    await page.getByRole("button", { name: "Upload audio" }).click();
    await (await chooser).setFiles({ name: "Owner Promo.wav", mimeType: "audio/wav", buffer: wav(4) });
  }).toPass({ timeout: 30_000 });
  await page.getByLabel(/own these recordings/).check();
  await page.getByRole("button", { name: "Add 1 track" }).click();
  await expect(page.getByText("Added", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Owner Promo").locator("visible=true").first()).toBeVisible();
});

