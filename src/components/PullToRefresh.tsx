"use client";

import { useLayoutEffect, useEffect, useRef, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { pullView } from "@/lib/pull-refresh";
import { stretchTarget, usePullToRefresh } from "./usePullToRefresh";

/** Sent on window when a pull refreshes the page, for client lists that keep their own data (LivePulse listens). */
export const REFRESH_EVENT = "ft:refresh";
const MIN_SPIN_MS = 600; // long enough to read as a refresh
const MAX_SPIN_MS = 15_000;
const RING = 69.1; // circumference of the r=11 ring
const SPRING = "translate .35s cubic-bezier(.2,.9,.3,1.2)";
const HOLD_EASE = "translate .25s ease-out";

function paint(el: HTMLElement, transition: string, translate: string) {
  el.style.transition = transition;
  el.style.translate = translate;
}

/**
 * Pull to refresh on every page (owner's rule; the rules themselves are src/lib/pull-refresh.ts). Phone: drag down from
 * the resting top and let go. Mouse: press on empty page, drag down, let go. Trackpad: pull past the top, then click
 * the Refresh button it offers. The page stretches down (`translate`, so a page's own `transform` animations are left
 * alone), a ring above fills and its arrow flips when armed, then the page holds while the ring spins and the route's
 * data reloads in place (router.refresh: what's typed and what's playing are kept). Reduced motion: no stretch, the
 * ring just fades. Mounted once, in the root layout.
 */
export function PullToRefresh() {
  const router = useRouter();
  const path = usePathname() ?? "";
  const { state, send } = usePullToRefresh(path);
  const view = pullView(state);
  const [pending, startTransition] = useTransition();
  const pendingRef = useRef(false);
  const stretched = useRef<HTMLElement | null>(null);
  const reduce = useRef(false);
  const ring = useRef<HTMLDivElement>(null);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    reduce.current = m.matches;
    const on = () => void (reduce.current = m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);

  // The ring sits centred over the page's own column (beside the desk's sidebar on wide screens).
  useLayoutEffect(() => {
    if (!view.ring || !ring.current) return;
    const r = (stretched.current ?? stretchTarget())?.getBoundingClientRect();
    ring.current.style.left = r ? `${r.left + r.width / 2}px` : "50%";
  }, [view.ring]);

  // The page follows the pull, holds while refreshing, and springs back.
  useLayoutEffect(() => {
    const offset = reduce.current ? 0 : view.offset;
    if (offset > 0) {
      const el = stretched.current?.isConnected ? stretched.current : stretchTarget();
      if (!el) return;
      stretched.current = el;
      paint(el, state.phase === "refreshing" ? HOLD_EASE : "none", `0 ${offset}px`);
      return;
    }
    const el = stretched.current;
    if (!el) return;
    stretched.current = null;
    paint(el, SPRING, "");
    const t = window.setTimeout(() => !el.style.translate && paint(el, "", ""), 400);
    return () => window.clearTimeout(t);
  }, [view.offset, state.phase]);

  // Release (or the trackpad's button): reload the route's data in place, then let the page spring back.
  useEffect(() => {
    if (state.phase !== "refreshing") return;
    window.dispatchEvent(new Event(REFRESH_EVENT));
    pendingRef.current = true;
    startTransition(() => router.refresh());
    const began = performance.now();
    let t = 0;
    const check = () => {
      const waited = performance.now() - began;
      if ((pendingRef.current && waited < MAX_SPIN_MS) || waited < MIN_SPIN_MS) t = window.setTimeout(check, 100);
      else send({ type: "done" });
    };
    t = window.setTimeout(check, MIN_SPIN_MS);
    return () => window.clearTimeout(t);
  }, [state.phase, router, send]);

  const ringTop = `calc(env(safe-area-inset-top) + ${Math.max(8, view.offset / 2 - 15)}px)`;
  return (
    <>
      <div
        ref={ring}
        aria-hidden
        className="ptr-ring"
        data-shown={view.ring || undefined}
        data-spinning={view.spinning || undefined}
        style={{ top: ringTop }}
      >
        <svg viewBox="0 0 30 30" width="30" height="30">
          <circle className="ptr-track" cx="15" cy="15" r="11" />
          <circle className="ptr-fill" cx="15" cy="15" r="11" strokeDasharray={RING} strokeDashoffset={view.spinning ? RING * 0.25 : RING * (1 - view.progress)} transform="rotate(-90 15 15)" />
          {!view.spinning && <path className="ptr-arrow" data-flipped={view.flipped || undefined} d="M15 9v11m-4-4 4 4 4-4" />}
        </svg>
      </div>
      <button
        type="button"
        className="ptr-pill"
        data-shown={view.offer || undefined}
        inert={!view.offer}
        onClick={() => send({ type: "offerClick" })}
      >
        Refresh
      </button>
      <p aria-live="polite" className="sr-only">
        {view.spinning ? "Refreshing" : ""}
      </p>
    </>
  );
}
