/**
 * When an open page asks for its change marker (LivePulse). Every check reads the database, and Neon only sleeps after
 * 5 idle minutes, so a page left open on screen used to keep it awake for as long as the tab stayed open (17 Nov).
 *
 *   - checks start at `base` (desk 10 s, receipt 8 s) and slow down while nothing changes: 30 s after 3 unchanged
 *     checks, 60 s after 6;
 *   - after 5 minutes with no input (pointer, key, scroll, touch) checks stop altogether;
 *   - any change, input after a slow-down, or the tab coming back into view goes back to `base`; input after a stop,
 *     or the tab coming back into view, checks straight away.
 */
export const IDLE_STOP_MS = 5 * 60_000;
export const SLOW_MS = 30_000;
export const SLOWEST_MS = 60_000;
const STEP_AFTER = 3;

/** How long to wait before the next check, after `unchanged` checks in a row that found nothing new. */
export function pulseDelay(base: number, unchanged: number) {
  if (unchanged < STEP_AFTER) return base;
  return unchanged < STEP_AFTER * 2 ? SLOW_MS : SLOWEST_MS;
}

/** `check` resolves true when the marker changed. */
export function pulseLoop(check: () => Promise<boolean>, base: number) {
  let unchanged = 0;
  let lastInput = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let stopped = false;

  const schedule = () => {
    clearTimeout(timer);
    timer = undefined;
    if (stopped || Date.now() - lastInput >= IDLE_STOP_MS) return;
    timer = setTimeout(tick, pulseDelay(base, unchanged));
  };
  async function tick() {
    if (stopped || running) return;
    if (Date.now() - lastInput >= IDLE_STOP_MS) {
      timer = undefined;
      return;
    }
    running = true;
    try {
      unchanged = (await check()) ? 0 : unchanged + 1;
    } catch {
      unchanged++;
    } finally {
      running = false;
    }
    schedule();
  }
  const idle = () => timer === undefined && !running;

  return {
    /** The first check, straight away. */
    start: () => void tick(),
    /** Someone used the page: restart after an idle stop, or speed up again after a slow-down. */
    input() {
      lastInput = Date.now();
      if (idle()) {
        unchanged = 0;
        return void tick();
      }
      if (unchanged >= STEP_AFTER) {
        unchanged = 0;
        schedule();
      }
    },
    /** The tab came back into view, or a pull to refresh reloaded it: check now, at full speed. */
    wake() {
      lastInput = Date.now();
      unchanged = 0;
      clearTimeout(timer);
      timer = undefined;
      void tick();
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
