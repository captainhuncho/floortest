import { expect, test } from "./fixtures";

/**
 * Rule 4 (audit 27 Oct): pages run only scripts carrying the request's nonce. Every script Next puts on the page has
 * it, nothing is refused, and the bot check (loaded by a trusted script, so allowed by 'strict-dynamic') still renders.
 * The dev server sends the same policy plus 'unsafe-eval' for React's overlays; the production policy is checked
 * in tests/csp.test.ts.
 */
test("pages load with a per-request script nonce, nothing is blocked, and the bot check still renders", async ({ page }) => {
  const refused: string[] = [];
  page.on("console", (m) => /Content Security Policy|Refused to (load|execute)/i.test(m.text()) && refused.push(m.text()));
  page.on("pageerror", (e) => refused.push(String(e)));

  const nonces = new Set<string>();
  for (const path of ["/", "/contact", "/privacy", "/login"]) {
    const res = await page.goto(path);
    const csp = res!.headers()["content-security-policy"] ?? "";
    const script = csp.split(/;\s*/).find((d) => d.startsWith("script-src "))!;
    const nonce = script.match(/'nonce-([^']+)'/)?.[1];
    expect(nonce, path).toBeTruthy();
    expect(script, path).toContain("'strict-dynamic'");
    expect(script, path).not.toContain("'unsafe-inline'");
    nonces.add(nonce!);
    // Every script tag in the server's HTML carries this request's nonce.
    const html = await res!.text();
    const tags = html.match(/<script\b[^>]*>/g) ?? [];
    expect(tags.length, path).toBeGreaterThan(0);
    for (const tag of tags) expect(tag, path).toContain(`nonce="${nonce}"`);
    if (path === "/contact") {
      // The bot check loads on first use of the form.
      await page.getByLabel("Name").focus();
      await expect(page.getByTestId("turnstile")).toBeAttached();
      await expect(page.locator('[name="cf-turnstile-response"]')).toHaveValue(/DUMMY/);
    }
  }
  expect(nonces.size, "a new nonce for every page load").toBe(4);
  expect(refused).toEqual([]);
});
