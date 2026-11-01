import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { opsLogIn } from "./ops-login";

/**
 * Held ops sends with Undo (ops server design §2, owner 1 Nov): an action that emails someone holds the email 8 s on the
 * server, and the toast reads "Sending in 5 s · Undo". Undo stops the email and puts the row back; waiting lets it go.
 * The test copy has no email key, so a sent email is "logged" in the Email log and a stopped one "cancelled".
 * One ops sign-in for all of it (a fresh two-step code each time can mean waiting half a minute).
 */
const UNDONE = "held-undo@example.com";
const SENT = "held-sent@example.com";

async function joinWaitlist(page: Page, email: string) {
  // A real load each time: going from "/#waitlist" to "/#waitlist" would only move the page, keeping the thank-you.
  await page.goto("/api/health");
  await page.goto("/#waitlist");
  const form = page.locator("#waitlist form");
  await form.getByLabel("Email").fill(email);
  // The bot check starts when the form is first used; its (stand-in) token must be there before sending.
  await form.getByTestId("turnstile").waitFor({ state: "attached" });
  await form.getByRole("button", { name: /Request an invite/ }).click();
  await expect(page.getByText("You're on the list.")).toBeVisible();
}

const toast = (page: Page, text: string | RegExp) => page.getByRole("region", { name: "Notifications" }).getByRole("status").filter({ hasText: text });

/** The Email log's status for the newest email to `to`. */
async function mailStatus(page: Page, to: string) {
  await page.goto(`/admin/emails?q=${encodeURIComponent(to)}`);
  return page.getByRole("listitem").filter({ hasText: `→ ${to}` }).first();
}

test("ops held sends: Undo stops the invite and the plan email, waiting sends it", async ({ page }) => {
  test.setTimeout(180_000);
  await joinWaitlist(page, UNDONE);
  await joinWaitlist(page, SENT);
  await opsLogIn(page);

  await test.step("invite from the waitlist, then Undo: not sent, back on the waitlist", async () => {
    await page.goto("/admin/waitlist");
    const row = page.getByRole("listitem").filter({ hasText: UNDONE });
    await row.getByRole("button", { name: "Invite" }).click();
    const held = toast(page, "Sending in");
    await expect(held).toContainText("Invited");
    await expect(held).toContainText(/Sending in [45] s/);
    await held.getByRole("button", { name: /Undo/ }).click();
    await expect(toast(page, "Not sent")).toBeVisible();
    // The page refreshed itself: the person is waiting again, with the Invite button back.
    await expect(row.getByText("Waiting", { exact: true })).toBeVisible();
    await expect(row.getByRole("button", { name: "Invite" })).toBeVisible();
    await expect((await mailStatus(page, UNDONE)).getByText("cancelled", { exact: true })).toBeVisible();
  });

  await test.step("invite and wait past the 8 s hold: Sent, and the email went", async () => {
    await page.goto("/admin/waitlist");
    const row = page.getByRole("listitem").filter({ hasText: SENT });
    await row.getByRole("button", { name: "Invite" }).click();
    const held = toast(page, "Invited");
    await expect(held).toContainText("Sending in");
    // The count goes down, and at the end Undo goes away and it says Sent.
    await expect(held).toContainText(/Sending in [123] s/, { timeout: 6_000 });
    await expect(held).toContainText("Sent", { timeout: 6_000 });
    await expect(held.getByRole("button", { name: /Undo/ })).toHaveCount(0);
    await page.waitForTimeout(4_000); // past the server's 8 s
    await expect((await mailStatus(page, SENT)).getByText("logged", { exact: true })).toBeVisible();
    await page.goto("/admin/waitlist?status=invited");
    await expect(page.getByRole("listitem").filter({ hasText: SENT }).getByText("Invited", { exact: true })).toBeVisible();
  });

  await test.step("Invite the oldest asks first, then still offers Undo", async () => {
    await page.goto("/admin/waitlist");
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: /Send invites/ }).click();
    const held = toast(page, "Invited 1 from the waitlist");
    await expect(held).toContainText("Sending in");
    await held.getByRole("button", { name: /Undo/ }).click();
    await expect(toast(page, "Not sent")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: UNDONE }).getByRole("button", { name: "Invite" })).toBeVisible();
  });

  await test.step("approve a plan request, then ⌘Z: pending again", async () => {
    await page.goto("/admin/plan-requests");
    const request = page.getByRole("listitem").filter({ hasText: "Wants Team" });
    await expect(request).toBeVisible();
    await request.getByRole("button", { name: "Approve" }).click();
    const held = toast(page, "Sending in");
    await expect(held).toContainText("is on Team");
    await expect(request).toHaveCount(0);
    // The keyboard Undo, from the page (not inside a field).
    await page.locator("h1").first().click();
    await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
    await expect(toast(page, "Not sent")).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: "Wants Team" })).toBeVisible();
  });
});
