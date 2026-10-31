/**
 * Pull to refresh, the gesture alone (owner's rule; ported from the IMSS Records dashboard's pullToRefresh.js). Pure:
 * every input is passed in (positions, the time, whether the page is at the top), so the rules are unit-tested
 * (tests/pull-refresh.test.ts) and the component (src/components/PullToRefresh.tsx) only wires events to it.
 *
 * - It starts only when the page has rested at the top for SETTLE_MS, never from a scroll that reaches the top.
 * - The pull is heavy (RESIST) and shows nothing inside a small dead zone. A sideways swipe cancels it.
 * - Pulling past TRIGGER only arms it; the release refreshes. Pulling back up before letting go disarms it.
 *   Holding never refreshes.
 * - Trackpad and wheel: a browser can't see fingers lift, so pulling past the top only arms it, and when the wheel
 *   goes quiet the "Refresh" button is offered for OFFER_MS. Only a click on it refreshes.
 */

export const TRIGGER = 90; // px of (resisted) pull that arms it
export const DEAD_ZONE = 24; // px of pull before anything shows
export const SETTLE_MS = 500; // the page must have been still at the top this long
export const RESIST = 0.35; // finger travel to pull distance (about a quarter screen of travel to arm on a phone)
export const MOUSE_RESIST = RESIST * 1.4;
export const WHEEL_RESIST = 0.12;
export const AXIS_LOCK = 10; // px of travel before the direction counts
export const WHEEL_IDLE_MS = 250; // the wheel is quiet this long: the gesture is over
export const OFFER_MS = 4000; // how long the trackpad's Refresh button stays
export const HOLD = 56; // px the page stays down while it refreshes

export type Source = "touch" | "mouse" | "wheel";
export type Phase = "idle" | "tracking" | "pulling" | "armed" | "refreshing" | "offer";

export type PullState = {
  phase: Phase;
  source: Source | null;
  x0: number;
  y0: number;
  pull: number;
  axis: "x" | "y" | null;
  /** A wheel gesture that began away from the resting top: ignored until the wheel goes quiet. */
  wheelIgnored: boolean;
};

export type PullEvent =
  | { type: "start"; source: "touch" | "mouse"; x: number; y: number; ready: boolean }
  | { type: "move"; x: number; y: number; atTop: boolean }
  | { type: "end" }
  | { type: "cancel" }
  | { type: "wheel"; deltaY: number; ready: boolean; atTop: boolean; fresh: boolean }
  | { type: "wheelIdle" }
  | { type: "offerTimeout" }
  | { type: "offerClick" }
  | { type: "done" };

export const IDLE: PullState = { phase: "idle", source: null, x0: 0, y0: 0, pull: 0, axis: null, wheelIgnored: false };

/** Settled at the top: scrolled to the very top, and no scroll for SETTLE_MS. */
export function restingAtTop(scrollTop: number, now: number, lastScrollAt: number) {
  return scrollTop <= 0 && now - lastScrollAt >= SETTLE_MS;
}

const phaseFor = (pull: number): Phase => (pull >= TRIGGER ? "armed" : pull >= DEAD_ZONE ? "pulling" : "tracking");

function move(s: PullState, x: number, y: number, atTop: boolean): PullState {
  if (s.source === "wheel" || !["tracking", "pulling", "armed"].includes(s.phase)) return s;
  if (!atTop) return IDLE; // the page scrolled after all: it's a scroll, not a pull
  const dx = Math.abs(x - s.x0);
  const dy = y - s.y0;
  let axis = s.axis;
  if (!axis && Math.max(dx, Math.abs(dy)) >= AXIS_LOCK) axis = dx > Math.abs(dy) ? "x" : "y";
  // Sideways first (a Review card swipe, a carousel), or drifting sideways later: not a pull.
  if (axis === "x" || dx > Math.max(30, dy * 0.6)) return IDLE;
  const pull = Math.max(0, dy) * (s.source === "mouse" ? MOUSE_RESIST : RESIST);
  return { ...s, axis, pull, phase: phaseFor(pull) };
}

function wheel(s: PullState, e: Extract<PullEvent, { type: "wheel" }>): PullState {
  if (s.phase === "refreshing" || s.phase === "offer") return s;
  if (s.source !== "wheel" && s.phase !== "idle") return s; // a touch or mouse pull is in progress
  // The first event of a gesture decides: only a gesture that begins at the resting top can pull.
  if (e.fresh && s.phase === "idle") {
    if (!e.ready) return { ...IDLE, wheelIgnored: true };
    s = { ...IDLE, source: "wheel", phase: "tracking" };
  }
  if (s.wheelIgnored || s.source !== "wheel") return s;
  if (!e.atTop) return IDLE;
  if (e.deltaY > 0) return s.pull > 0 ? { ...IDLE, wheelIgnored: true } : s; // scrolled back down: cancelled
  const pull = Math.min(s.pull + -e.deltaY * WHEEL_RESIST, TRIGGER + 30);
  return { ...s, pull, phase: phaseFor(pull) };
}

export function reducePull(s: PullState, e: PullEvent): PullState {
  switch (e.type) {
    case "start":
      if (s.phase === "refreshing" || s.phase === "offer") return s;
      return e.ready ? { ...IDLE, phase: "tracking", source: e.source, x0: e.x, y0: e.y } : IDLE;
    case "move":
      return move(s, e.x, e.y, e.atTop);
    case "end":
      if (s.source === "wheel") return s;
      // Only the release of an armed pull refreshes; anything short of it springs back.
      return s.phase === "armed" ? { ...s, phase: "refreshing", pull: HOLD } : s.phase === "refreshing" || s.phase === "offer" ? s : IDLE;
    case "cancel":
      return s.phase === "refreshing" || s.phase === "offer" ? s : IDLE;
    case "wheel":
      return wheel(s, e);
    case "wheelIdle":
      if (s.source !== "wheel") return s.wheelIgnored ? { ...s, wheelIgnored: false } : s;
      // Armed with the wheel: offer the button (the page springs back). Never refresh here.
      return s.phase === "armed" ? { ...IDLE, source: "wheel", phase: "offer" } : s.phase === "offer" || s.phase === "refreshing" ? s : IDLE;
    case "offerTimeout":
      return s.phase === "offer" ? IDLE : s;
    case "offerClick":
      return s.phase === "offer" ? { ...IDLE, source: "wheel", phase: "refreshing" } : s;
    case "done":
      return s.phase === "refreshing" ? IDLE : s;
  }
}

/** What the screen shows for a state: how far the page is stretched, the ring and the button. */
export function pullView(s: PullState) {
  const showing = s.phase === "pulling" || s.phase === "armed";
  return {
    offset: s.phase === "refreshing" ? HOLD : showing ? s.pull : 0,
    ring: showing || s.phase === "refreshing",
    progress: s.phase === "refreshing" ? 1 : Math.min(1, s.pull / TRIGGER),
    flipped: s.phase === "armed",
    spinning: s.phase === "refreshing",
    offer: s.phase === "offer",
  };
}
