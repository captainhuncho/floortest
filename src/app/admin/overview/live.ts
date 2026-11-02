import type { IconName } from "../AdminNav";
import type { FeedItem, FeedKind } from "@/lib/ops-feed";

/**
 * The Overview's Live card, its plain rules (admin redesign B, step 6; GET /api/admin/feed): when to ask for new
 * activity, which rows are new, and each kind's icon. No React, DOM or clock of its own, so tests/ops-live.test.ts runs
 * them with a fake clock and fake timers.
 */

/** Never sooner than this: the server reads the feed at most every 30 s (FEED_TTL_MS), so asking sooner gains nothing. */
export const LIVE_MIN_MS = 30_000;
/** Rows the card shows. Every row is one line and 44 px, so the card's height never changes as rows come and go. */
export const LIVE_ROWS = 8;

export const LIVE_KIND: Record<FeedKind, { icon: IconName; label: string }> = {
  signup: { icon: "users", label: "Sign-up" },
  first: { icon: "inbox", label: "First track" },
  takedown: { icon: "alert", label: "Takedown" },
  admin: { icon: "log", label: "Admin action" },
};

/**
 * How long ago, in the card's few characters: "now", "4 min", "2 h", "3 d". Plain arithmetic, no time zone or locale,
 * so the server's first paint and the browser's hydration always agree.
 */
export function liveAgo(ts: number, now: number) {
  const m = Math.floor(Math.max(0, now - ts) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h` : `${Math.floor(h / 24)} d`;
}

/** One row's identity across polls (the feed has no ids: admin actions share an empty ref). */
export const liveKey = (i: Pick<FeedItem, "kind" | "ref" | "created_at" | "text">) => `${i.kind}:${i.ref}:${i.created_at}:${i.text}`;

/** The keys in `next` that `prev` didn't have: these fade in, once. */
export function freshKeys(prev: readonly FeedItem[], next: readonly FeedItem[]): Set<string> {
  const had = new Set(prev.map(liveKey));
  return new Set(next.map(liveKey).filter((k) => !had.has(k)));
}

/** Why the card isn't asking right now, or null when it may. Order matters only for which reason the card shows. */
export type LiveBlock = "paused" | "data" | "hidden" | "offscreen" | "stopped";
export type LiveState = { paused: boolean; saveData: boolean; hidden: boolean; onScreen: boolean; stopped: boolean };

export function liveBlock(s: LiveState): LiveBlock | null {
  if (s.stopped) return "stopped";
  if (s.paused) return "paused";
  if (s.saveData) return "data";
  if (s.hidden) return "hidden";
  if (!s.onScreen) return "offscreen";
  return null;
}

type Timers = { set: (fn: () => void, ms: number) => unknown; clear: (t: unknown) => void; now: () => number };

/**
 * The poll clock. It asks (`tick`) every `every` ms (never under LIVE_MIN_MS) while nothing blocks it: not paused, no
 * data saver, the tab visible and the card on screen. Anything blocking cancels the timer at once; when the block lifts
 * it waits out what is left of the interval since the last ask (straight away if that has passed). One timer at most,
 * and only one ask in flight: the next is timed from when an answer comes back.
 */
export function createPoller(tick: () => Promise<unknown>, every: number, timers: Timers, startedAt = timers.now()) {
  const gap = Math.max(LIVE_MIN_MS, every);
  let state: LiveState = { paused: false, saveData: false, hidden: false, onScreen: false, stopped: false };
  let last = startedAt;
  let timer: unknown = null;
  let busy = false;

  const cancel = () => {
    if (timer !== null) timers.clear(timer);
    timer = null;
  };
  const plan = () => {
    cancel();
    if (busy || liveBlock(state)) return;
    timer = timers.set(run, Math.max(0, last + gap - timers.now()));
  };
  const run = () => {
    timer = null;
    if (liveBlock(state)) return;
    busy = true;
    last = timers.now();
    tick()
      .catch(() => {})
      .finally(() => {
        busy = false;
        last = timers.now();
        plan();
      });
  };

  return {
    set(patch: Partial<LiveState>) {
      state = { ...state, ...patch };
      plan();
    },
    /** Whether a timer is waiting (for tests). */
    get waiting() {
      return timer !== null;
    },
    get state() {
      return state;
    },
    stop() {
      state = { ...state, stopped: true };
      cancel();
    },
  };
}
