"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FeedItem } from "@/lib/ops-feed";
import { Icon } from "../AdminNav";
import { announce } from "../kit/live";
import { createPoller, freshKeys, LIVE_KIND, LIVE_MIN_MS, LIVE_ROWS, liveAgo, liveKey } from "./live";

const FEED_URL = "/api/admin/feed";
/** A hung request gives up after this, so the next one can be timed. */
const ASK_TIMEOUT_MS = 15_000;
const TICK_MS = 15_000;

// The times say "4 min": read from the browser's clock every 15 s. The server's `now` is the first paint's, so
// hydration agrees, then the browser's follows (useSyncExternalStore: no state set while mounting, PR #338).
const tickEvery = (tick: () => void) => {
  const t = setInterval(tick, TICK_MS);
  return () => clearInterval(t);
};
const readClock = () => Math.floor(Date.now() / TICK_MS) * TICK_MS;

// Reduced data: the data saver (Chrome, Android) or prefers-reduced-data where a browser has it. Either way, no polling.
type Conn = EventTarget & { saveData?: boolean };
const conn = () => (typeof navigator !== "undefined" ? ((navigator as Navigator & { connection?: Conn }).connection ?? null) : null);
const REDUCED_DATA = "(prefers-reduced-data: reduce)";
const readSaveData = () => conn()?.saveData === true || window.matchMedia(REDUCED_DATA).matches;
const onSaveData = (change: () => void) => {
  const c = conn();
  const mq = window.matchMedia(REDUCED_DATA);
  c?.addEventListener("change", change);
  mq.addEventListener("change", change);
  return () => {
    c?.removeEventListener("change", change);
    mq.removeEventListener("change", change);
  };
};

type Feed = { items: FeedItem[]; fresh: ReadonlySet<string>; failed: boolean; gone: boolean };

/**
 * The Overview's Live card (admin redesign B's "Live" panel; GET /api/admin/feed): sign-ups, first tracks, takedown
 * claims and admin actions, newest first. The first paint is the server's own read. Then it asks again every 30 s, but
 * only while it is worth it: not paused, the tab visible, the card on screen and no data saver. New rows fade in once.
 * Screen readers hear nothing unless "Announce" is on. If the feed refuses this person (403), the card goes away.
 */
export function LiveCard({ initial, now }: { initial: FeedItem[]; now: number }) {
  const [feed, setFeed] = useState<Feed>(() => ({ items: initial, fresh: new Set(), failed: false, gone: false }));
  const [paused, setPaused] = useState(false);
  const [speak, setSpeak] = useState(false);
  const clock = useSyncExternalStore(tickEvery, readClock, () => now);
  const saveData = useSyncExternalStore(onSaveData, readSaveData, () => false);
  const card = useRef<HTMLElement>(null);
  const poller = useRef<ReturnType<typeof createPoller> | null>(null);
  const items = useRef(initial);
  const speakRef = useRef(speak);
  useEffect(() => {
    speakRef.current = speak;
  });

  useEffect(() => {
    let live = true;
    const ask = async () => {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), ASK_TIMEOUT_MS);
      try {
        const r = await fetch(FEED_URL, { cache: "no-store", signal: ctrl.signal, headers: { accept: "application/json" } });
        if (!live) return;
        if (r.status === 401 || r.status === 403) {
          p.stop();
          setFeed((f) => ({ ...f, gone: true }));
          return;
        }
        if (!r.ok) throw new Error(String(r.status));
        const next = ((await r.json()) as { items?: FeedItem[] }).items ?? [];
        if (!live) return;
        const fresh = freshKeys(items.current, next);
        items.current = next;
        setFeed({ items: next, fresh, failed: false, gone: false });
        const said = next.filter((i) => fresh.has(liveKey(i))).slice(0, 3);
        if (speakRef.current && said.length) announce(`${fresh.size} new: ${said.map((i) => i.text).join("; ")}`);
      } catch {
        if (live) setFeed((f) => (f.failed ? f : { ...f, failed: true }));
      } finally {
        window.clearTimeout(t);
      }
    };
    const p = createPoller(ask, LIVE_MIN_MS, { set: (fn, ms) => window.setTimeout(fn, ms), clear: (id) => window.clearTimeout(id as number), now: () => Date.now() });
    poller.current = p;
    const seen = () => p.set({ hidden: document.hidden });
    document.addEventListener("visibilitychange", seen);
    const io = new IntersectionObserver((es) => p.set({ onScreen: es.some((e) => e.isIntersecting) }));
    if (card.current) io.observe(card.current);
    p.set({ hidden: document.hidden, saveData: readSaveData() });
    return () => {
      live = false;
      p.stop();
      io.disconnect();
      document.removeEventListener("visibilitychange", seen);
    };
  }, []);

  useEffect(() => {
    poller.current?.set({ paused, saveData });
  }, [paused, saveData]);

  if (feed.gone) return null;
  const rows = feed.items.slice(0, LIVE_ROWS);
  const status = paused ? "Paused" : saveData ? "Not updating: data saver is on" : feed.failed ? "Couldn't update, trying again" : null;
  const toggle = () => {
    setPaused(!paused);
    announce(paused ? "Live activity resumed" : "Live activity paused");
  };

  return (
    <section ref={card} aria-labelledby="live-h" className="admin-panel admin-rise p-5" style={{ "--i": 4 } as React.CSSProperties} data-live-card="">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h2 id="live-h" className="mr-auto flex items-center gap-2 text-[16px] font-semibold">
          <span aria-hidden className={`size-1.5 rounded-full ${status ? "bg-faint" : "admin-live relative bg-lime"}`} />
          Live
        </h2>
        <button type="button" onClick={() => setSpeak(!speak)} aria-pressed={speak} className="admin-press inline-flex min-h-11 items-center rounded-[11px] px-3 text-[13px] text-mute hover:bg-ink-3 hover:text-bone aria-pressed:bg-ink-4 aria-pressed:font-semibold aria-pressed:text-bone">
          Announce
        </button>
        <button type="button" onClick={toggle} className="admin-press inline-flex min-h-11 min-w-[5.5rem] items-center justify-center rounded-[11px] bg-ink-3 px-3 text-[13px] font-semibold hover:bg-ink-4">
          {paused ? "Resume" : "Pause"}
          <span className="sr-only"> live activity</span>
        </button>
      </div>
      <p className="min-h-5 text-[12.5px] text-mute" data-live-status="">
        {status ?? `Every ${LIVE_MIN_MS / 1000} s while this page is open`}
      </p>
      {rows.length ? (
        <ul aria-label="Recent activity" className="ops-live-rows -mx-2 mt-2">
          {rows.map((i) => {
            const k = LIVE_KIND[i.kind];
            return (
              <li key={liveKey(i)} className={feed.fresh.has(liveKey(i)) ? "ops-live-new" : undefined}>
                <Link href={i.href} className="grid min-h-11 grid-cols-[20px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-[11px] px-2 text-[13.5px] hover:bg-ink-3">
                  <Icon name={k.icon} className="size-[18px] text-mute" />
                  <span className="truncate">
                    <span className="sr-only">{k.label}: </span>
                    {i.text}
                    {i.kind === "signup" && <span className="text-mute"> joined</span>}
                  </span>
                  <time dateTime={new Date(i.created_at).toISOString()} className="text-[12.5px] text-mute tnum">
                    {liveAgo(i.created_at, clock)}
                    {liveAgo(i.created_at, clock) !== "now" && <span className="sr-only"> ago</span>}
                  </time>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="ops-live-rows mt-2 text-[13.5px] text-mute">Nothing yet. Sign-ups, first tracks, takedown claims and admin actions show here as they happen.</p>
      )}
    </section>
  );
}
