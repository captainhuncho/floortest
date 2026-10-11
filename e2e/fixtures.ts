import { test as base, type Page } from "@playwright/test";

/**
 * Stands in for Cloudflare's Turnstile script (the test machine may not reach Cloudflare): renders the widget's
 * hidden field with Cloudflare's documented dummy token, like the always-pass test keys do. The server-side rules
 * (no token after repeated failures = refused) are still exercised for real.
 */
export const FAKE_TURNSTILE = `
window.turnstile = {
  render(el) {
    const box = document.createElement("div");
    box.setAttribute("data-testid", "turnstile");
    const input = document.createElement("input");
    input.type = "hidden"; input.name = "cf-turnstile-response"; input.value = "XXXX.DUMMY.TOKEN.XXXX";
    box.appendChild(input); el.appendChild(box);
    return "fake-" + Math.random();
  },
  execute() {}, reset() {}, remove() {},
};`;

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route("https://challenges.cloudflare.com/turnstile/v0/api.js*", (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_TURNSTILE }));
    await use(page);
  },
});
export { expect } from "@playwright/test";

/** A short, valid WAV with a kick-drum pulse, so in-browser analysis has something real to read. */
export function wav(seconds = 6) {
  const rate = 22050;
  const n = rate * seconds;
  const beat = (60 / 124) * rate;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write("WAVE", 8); buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const t = (i % beat) / rate;
    buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * (50 + 120 * Math.exp(-t * 30)) * t) * Math.exp(-t * 9) * 29000), 44 + i * 2);
  }
  return buf;
}

/** Password of the seeded test accounts (scripts/seed.ts): the demo receiver and the test listeners. */
export const TEST_PASSWORD = "floortest-demo";

/** Logs a seeded test account in and waits for the dashboard. */
export async function logIn(page: Page, email: string) {
  await page.goto("/login");
  await submitLogin(page, email, /\/dashboard\//);
}

/** Fills the log-in form already on screen; if the human check appears (see the guards spec), logs in again with it. */
export async function submitLogin(page: Page, email: string, landing: RegExp) {
  await page.getByLabel("Email").fill(email);
  await page.getByRole("textbox", { name: "Password" }).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "Log in" }).click();
  const dashboard = page.waitForURL(landing, { timeout: 60_000 }).then(() => "in" as const);
  const check = page.getByTestId("turnstile").waitFor({ state: "attached", timeout: 60_000 }).then(() => "check" as const, () => "none" as const);
  // The check may already be on screen with a token (then the first click got through): retry only if still here.
  if ((await Promise.race([dashboard, check])) === "check" && !(await page.waitForURL(landing, { timeout: 5_000 }).then(() => true, () => false))) {
    await page.getByRole("textbox", { name: "Password" }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(landing);
  }
  await dashboard.catch(() => {});
}
