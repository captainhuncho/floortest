import { expect, test } from "./fixtures";
import { OPS_BLOCKED, OPS_CLAIMED } from "./ops-account";
import { flipOpsShell, opsLogIn } from "./ops-login";

/**
 * The new Moderation (admin redesign B, step 4) behind the `ops_shell` switch: a queue of only the tracks with a real
 * signal. The seeded ops desk (scripts/seed.ts, SEED_OPS) has a track with an open takedown claim (staff may play it)
 * and one from a blocked sender (still waveform, no Play). Keep takes a row out and the count drops; Remove asks for a
 * reason first and is cancelled here. The switch goes back off at the end.
 */
test("ops moderation: off is today's page; on, the signal queue, the listening rule, Remove asks a reason, Keep clears a row", async ({ page }) => {
  test.setTimeout(240_000);
  await opsLogIn(page);

  await test.step("switch off: today's search page", async () => {
    await page.goto("/admin/moderation");
    await expect(page.getByText("Search every account by track, artist, sender name or email, or a receipt token.")).toBeVisible();
    await expect(page.getByRole("list", { name: "Tracks with a signal" })).toHaveCount(0);
  });

  await flipOpsShell(page, true);

  const list = page.getByRole("list", { name: "Tracks with a signal" });
  const heading = page.locator("main h1");
  const decision = page.getByRole("complementary", { name: "Decision" });
  const count = async () => Number((await page.getByText(/^Tracks with a signal · \d+ · newest first$/).textContent())?.match(/\d+/)?.[0]);
  let before = 0;

  await test.step("switch on: only the tracks with a signal, newest first, in words", async () => {
    await page.goto("/admin/moderation");
    await expect(heading).toHaveText("Moderation");
    await expect(list.getByRole("link", { name: new RegExp(OPS_CLAIMED.title) })).toContainText("Takedown claim by Atlas Publishing");
    await expect(list.getByRole("link", { name: new RegExp(OPS_BLOCKED.title) })).toContainText("Blocked by 1 receiver");
    before = await count();
    expect(before).toBe(await list.getByRole("listitem").count());
    const tabs = page.getByRole("group", { name: "Filter by signal" });
    await tabs.getByRole("button", { name: /^Takedown/ }).click();
    await expect(list.getByRole("link", { name: new RegExp(OPS_BLOCKED.title) })).toHaveCount(0);
    await tabs.getByRole("button", { name: /^All/ }).click();
  });

  await test.step("a takedown claim plays; any other track shows a still waveform and no Play", async () => {
    await list.getByRole("link", { name: new RegExp(OPS_CLAIMED.title) }).click();
    await expect(page.getByRole("heading", { level: 2, name: OPS_CLAIMED.title })).toBeVisible();
    await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
    await list.getByRole("link", { name: new RegExp(OPS_BLOCKED.title) }).click();
    await expect(page.getByRole("heading", { level: 2, name: OPS_BLOCKED.title })).toBeVisible();
    await expect(page.getByRole("img", { name: new RegExp(`^Waveform of ${OPS_BLOCKED.title}`) })).toBeVisible();
    await expect(page.getByText("Listening is only for tracks with an open takedown claim.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Play" })).toHaveCount(0);
  });

  await test.step("Remove asks for a reason first", async () => {
    await decision.getByRole("button", { name: "Remove", exact: true }).click();
    const ask = page.getByRole("dialog", { name: `Remove "${OPS_BLOCKED.title}"?` });
    await expect(ask).toBeVisible();
    const yes = ask.getByRole("button", { name: "Remove track" });
    await expect(yes).toBeDisabled();
    await ask.getByLabel("Reason (kept in the admin log)").fill("e2e: checking the reason is asked");
    await expect(yes).toBeEnabled();
    await ask.getByRole("button", { name: "Cancel" }).click();
    await expect(ask).toBeHidden();
    await expect(list.getByRole("link", { name: new RegExp(OPS_BLOCKED.title) })).toBeVisible();
  });

  await test.step("Keep marks it reviewed: the row leaves, the count drops, the next row opens", async () => {
    await decision.getByRole("button", { name: "Keep", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: `Kept "${OPS_BLOCKED.title}": marked reviewed` })).toBeVisible();
    await expect(list.getByRole("link", { name: new RegExp(OPS_BLOCKED.title) })).toHaveCount(0);
    await expect.poll(count).toBe(before - 1);
    await expect(page.getByRole("heading", { level: 2, name: OPS_BLOCKED.title })).toHaveCount(0);
    await expect(list.locator('[aria-current="true"]')).toHaveCount(1);
  });

  await test.step("keys: '?' lists the queue's own", async () => {
    await heading.click();
    await page.keyboard.press("?");
    const keys = page.getByRole("dialog", { name: "Keyboard shortcuts" });
    await expect(keys.getByText("Keep (mark reviewed)")).toBeVisible();
    await expect(keys.getByText("Space", { exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
  });

  await flipOpsShell(page, false);
  await page.goto("/admin/moderation");
  await expect(page.getByText("Search every account by track, artist, sender name or email, or a receipt token.")).toBeVisible();
});
