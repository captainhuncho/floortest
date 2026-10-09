import { test as base } from "@playwright/test";

/**
 * Stands in for Cloudflare's Turnstile script (the test machine may not reach Cloudflare): renders the widget's
 * hidden field with Cloudflare's documented dummy token, like the always-pass test keys do. The server-side rules
 * (no token after repeated failures = refused) are still exercised for real.
 */
const FAKE_TURNSTILE = `
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
