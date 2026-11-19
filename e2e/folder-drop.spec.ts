import { expect, hydrated, logIn, test, wav } from "./fixtures";

/**
 * Dropping files on Projects (laptop and desktop; phones keep Upload audio): the upload opens with the WAV ready to add,
 * and a music-software project file dropped with it is named as skipped. A synthetic drop has no folder entries, so this
 * covers the loose-files path; folder walking is covered in tests/dropped-files.test.ts.
 */
test("files dropped on Projects open the upload, and a music-software project file is skipped and named", async ({ page }) => {
  await logIn(page, "demo@floortest.test");
  await page.goto("/dashboard/projects");
  // The drop listener starts once the page is interactive; a drop before that goes to the browser.
  await hydrated(page.getByRole("button", { name: "Upload audio" }).first());

  const audio = wav(2).toString("base64");
  const dt = await page.evaluateHandle((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const t = new DataTransfer();
    t.items.add(new File([bytes], "Dropped Tune.wav", { type: "audio/wav" }));
    t.items.add(new File(["x"], "Dropped Tune.als"));
    return t;
  }, audio);
  await page.dispatchEvent("main", "dragover", { dataTransfer: dt });
  await expect(page.getByText("Drop a folder to make a project, or tracks to add")).toBeVisible();
  await page.dispatchEvent("main", "drop", { dataTransfer: dt });

  await expect(page.getByLabel("Title for Dropped Tune.wav")).toBeVisible();
  await expect(page.getByText(/^Skipped 1 item that isn't WAV or MP3: Dropped Tune\.als\. Music-software projects can't be played here/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Add 1 track" })).toBeVisible();
  await expect(page.getByText("Drop a folder to make a project, or tracks to add")).toHaveCount(0);
});
