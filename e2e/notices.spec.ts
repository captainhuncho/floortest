import { expect, logIn, test } from "./fixtures";
import { opsLogIn } from "./ops-login";

/**
 * Ops → Notices (Desk, 13 Nov): staff add a notice with four times, it shows as a thin strip on the signed-in dashboard
 * with the times in the person's zone, a <script> title stays text, and closing it is remembered in that browser.
 */
const stamp = Date.now().toString(36);
const M = 60_000;
const local = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

test("a notice added in ops shows on the dashboard as text, and closing it sticks", async ({ page, browser }) => {
  const title = `<script>alert(1)</script> Short update ${stamp}`;
  const t = Date.now();
  await opsLogIn(page);
  await page.goto("/admin/notices");
  await page.getByLabel(/^Title/).fill(title);
  await page.getByLabel(/One line of detail/).fill("Uploads pause for a few minutes.");
  await page.getByLabel("Show from").fill(local(t - 60 * M));
  await page.getByLabel("Update starts").fill(local(t + 60 * M));
  await page.getByLabel("Update ends").fill(local(t + 80 * M));
  await page.getByLabel("Hide after").fill(local(t + 180 * M));
  await page.getByRole("button", { name: "Add notice" }).click();
  const live = page.getByRole("region", { name: /Showing now/ });
  await expect(live.getByRole("listitem").filter({ hasText: title })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("notices-admin-desktop.png"), fullPage: true });

  // The admin log has the line.
  await page.goto("/admin/log");
  await expect(page.getByText(`Short update ${stamp}`).first()).toBeVisible();

  // A receiver, in their own browser.
  const ctx = await browser.newContext();
  const desk = await ctx.newPage();
  let alerted = false;
  desk.on("dialog", (d) => {
    alerted = true;
    void d.dismiss();
  });
  await logIn(desk, "demo@floortest.test");
  await desk.goto("/dashboard/floor");
  const strip = desk.getByRole("status").filter({ hasText: `Short update ${stamp}` });
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("<script>alert(1)</script>");
  await expect(strip).toContainText("Uploads pause for a few minutes.");
  expect(alerted, "the title never runs as script").toBe(false);
  const close = strip.getByRole("button", { name: "Close this notice" });
  const box = await close.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  await desk.screenshot({ path: test.info().outputPath("notices-strip-desktop.png") });
  await desk.setViewportSize({ width: 390, height: 844 });
  await desk.screenshot({ path: test.info().outputPath("notices-strip-phone.png") });
  await desk.setViewportSize({ width: 320, height: 640 });
  expect(await desk.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), "no sideways scroll at 320px").toBe(true);

  await close.click();
  await expect(strip).toHaveCount(0);
  await desk.reload();
  await expect(desk.getByRole("heading").first()).toBeVisible();
  await expect(desk.getByRole("status").filter({ hasText: `Short update ${stamp}` })).toHaveCount(0);
  await ctx.close();

  // End early: it moves to Past.
  await page.goto("/admin/notices");
  await page.getByRole("region", { name: /Showing now/ }).getByRole("button", { name: "End early" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "End now" }).click();
  await expect(page.getByRole("region", { name: /Past/ }).getByRole("listitem").filter({ hasText: title })).toBeVisible();
});
