import type { CDPSession, Locator, Page } from "@playwright/test";
import { expect, test } from "./fixtures";
import { opsLogIn } from "./ops-login";

/**
 * A tap answers at once (speed fixes phase 1, 2 Nov): buttons, links and fields carry touch-action: manipulation (no
 * 300 ms double-tap wait on mobile Safari), and a press shows its pressed look on the next frame, measured here on a
 * phone-sized touch screen with the CPU slowed 4×: from pointerdown to the computed style showing the press.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

const PRESS_LIMIT_MS = 50;

/**
 * Holds a finger (CDP touch) or the mouse button on `target` and returns how long the pressed look took to show, in
 * ms (-1: not within a second). Nothing is clicked: the touch ends with a cancel, the mouse is moved off first.
 */
async function pressDelay(page: Page, cdp: CDPSession, target: Locator, by: "touch" | "mouse") {
  await target.scrollIntoViewIfNeeded();
  const box = (await target.boundingBox())!;
  await target.evaluate((el) => {
    const w = window as unknown as { pressMs?: Promise<number> };
    w.pressMs = new Promise((done) => {
      // Capture on window: this runs before React's own listener, so the clock starts at the real pointerdown.
      window.addEventListener(
        "pointerdown",
        () => {
          const t0 = performance.now();
          const pressed = () => {
            const cs = getComputedStyle(el);
            return cs.scale === "0.97" || /^matrix\(0\.97,/.test(cs.transform);
          };
          const check = () => {
            if (pressed()) done(performance.now() - t0);
            else if (performance.now() - t0 > 1000) done(-1);
            else requestAnimationFrame(check);
          };
          check();
        },
        { capture: true, once: true },
      );
    });
  });
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  if (by === "touch") await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  else {
    await page.mouse.move(point.x, point.y);
    await page.mouse.down();
  }
  const ms = await page.evaluate(() => (window as unknown as { pressMs: Promise<number> }).pressMs);
  if (by === "touch") await cdp.send("Input.dispatchTouchEvent", { type: "touchCancel", touchPoints: [] });
  else {
    await page.mouse.move(1, 1);
    await page.mouse.up();
  }
  return ms;
}

test("taps: touch-action on everything tappable, pressed look within 50 ms at 4× CPU", async ({ page }) => {
  const cdp = await page.context().newCDPSession(page);

  await test.step("buttons, links and fields have touch-action: manipulation", async () => {
    await page.goto("/login");
    const actions = await page.evaluate(() =>
      ["button", "a[href]", "input:not([type=hidden])"].map((sel) => {
        const el = document.querySelector(sel);
        return [sel, el ? getComputedStyle(el).touchAction : "missing"];
      }),
    );
    for (const [sel, value] of actions) expect(value, sel).toBe("manipulation");
  });

  // An ordinary button's press is CSS :active. Chromium's touch emulation sets :active only once its gesture detector
  // calls the touch a press (it never did while held, in testing), so this one is measured with the mouse; iOS Safari
  // sets :active on touchstart because the page has a touchstart listener (usePullToRefresh).
  await test.step("an ordinary button shows its press at once", async () => {
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const ms = await pressDelay(page, cdp, page.getByRole("button", { name: /^Sign in|^Send|^Continue/ }).first(), "mouse");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    test.info().annotations.push({ type: "button press ms", description: ms.toFixed(1) });
    expect(ms, "pressed look shows").toBeGreaterThanOrEqual(0);
    expect(ms).toBeLessThanOrEqual(PRESS_LIMIT_MS);
  });

  await test.step("an OpsButton shows its press at once; the spinner still waits 150 ms", async () => {
    await opsLogIn(page);
    await page.goto("/admin/feedback?status=all");
    const button = page.locator("button.kit-press").first();
    await expect(button).toBeVisible();
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const ms = await pressDelay(page, cdp, button, "touch");
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    test.info().annotations.push({ type: "OpsButton press ms", description: ms.toFixed(1) });
    expect(ms, "pressed look shows").toBeGreaterThanOrEqual(0);
    expect(ms).toBeLessThanOrEqual(PRESS_LIMIT_MS);
    // Lifted (a cancel, so nothing ran): the pressed look goes and no spinner showed.
    await expect(button).not.toHaveAttribute("data-pressed");
    await expect(button).toHaveAttribute("data-phase", "idle");
  });
});
