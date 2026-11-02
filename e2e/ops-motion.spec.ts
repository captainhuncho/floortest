import { expect, test } from "./fixtures";
import { opsLogIn } from "./ops-login";

/**
 * Ops arrival motion is quick (owner in the Desk, 2 Nov, speed fixes phase 1): every arrival animation in admin.css
 * and the kit lasts 250 ms or less and starts at once (no stagger, no delay). With reduced motion nothing moves: the
 * site-wide rule in globals.css drops every animation, so panels are simply there.
 * Probe elements carry each class inside #theme-root, so the check doesn't depend on which panels the seeded data
 * shows; "admin-still" (AdminMotion.tsx, a page already seen) is lifted for the read so the arrival rules apply.
 */
const ARRIVALS = ["admin-rise", "admin-area", "admin-grow", "admin-grow-y", "admin-tick", "admin-draw", "admin-fill", "kit-bulkbar", "kit-toast"];
const LIMIT_S = 0.25;

type Timing = { cls: string; name: string; duration: number; delay: number };

function readTimings(classes: string[]): Timing[] {
  const root = document.getElementById("theme-root")!;
  root.classList.remove("admin-still");
  const sec = (v: string) => Math.max(...v.split(",").map((x) => (x.trim().endsWith("ms") ? parseFloat(x) / 1000 : parseFloat(x))));
  const host = document.createElement("div");
  root.appendChild(host);
  const out = classes.map((cls) => {
    const el = document.createElement("div");
    el.className = cls;
    el.style.setProperty("--i", "8");
    host.appendChild(el);
    const cs = getComputedStyle(el);
    return { cls, name: cs.animationName, duration: sec(cs.animationDuration), delay: sec(cs.animationDelay) };
  });
  host.remove();
  return out;
}

test("ops arrival motion: 250 ms or less, no stagger, nothing moves with reduced motion", async ({ page }) => {
  await opsLogIn(page);
  await page.goto("/admin");
  await expect(page.locator("#theme-root")).toBeAttached();

  await test.step("every arrival lasts 250 ms or less and starts at once", async () => {
    const timings = await page.evaluate(readTimings, ARRIVALS);
    for (const t of timings) {
      expect(t.name, `${t.cls} animates`).not.toBe("none");
      expect(t.duration, `${t.cls} duration`).toBeLessThanOrEqual(LIMIT_S);
      // The area under a line waits for the line (≤ 250 ms in all); everything else starts at once.
      expect(t.delay + t.duration, `${t.cls} delay + duration`).toBeLessThanOrEqual(LIMIT_S);
      if (t.cls !== "admin-fill") expect(t.delay, `${t.cls} has no stagger`).toBe(0);
    }
  });

  await test.step("the Overview's own panels use those timings", async () => {
    const real = await page.evaluate(() => {
      document.getElementById("theme-root")!.classList.remove("admin-still");
      return [...document.querySelectorAll(".admin-rise, .admin-grow, .admin-grow-y")].map((el) => {
        const cs = getComputedStyle(el);
        return parseFloat(cs.animationDuration) * (cs.animationDuration.endsWith("ms") ? 0.001 : 1) + parseFloat(cs.animationDelay);
      });
    });
    expect(real.length).toBeGreaterThan(0);
    for (const total of real) expect(total).toBeLessThanOrEqual(LIMIT_S);
  });

  await test.step("reduced motion: nothing moves", async () => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const timings = await page.evaluate(readTimings, ARRIVALS);
    for (const t of timings) expect(t.name, t.cls).toBe("none");
    await page.emulateMedia({ reducedMotion: null });
  });
});
