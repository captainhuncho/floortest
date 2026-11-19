"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { playedOutBatch, skipPlayedOutPrompt } from "../actions/review";
import type { PromptTrack } from "@/lib/played-out-prompt";

/** Height of the phone's player and menu pair (BottomPair.tsx), so the pinned bar sits just above it. 0 where there is none. */
function usePairHeight() {
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-bottom-pair]");
    if (!el) return;
    const measure = () => setH(el.offsetHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el, { box: "border-box" });
    return () => ro.disconnect();
  }, []);
  return h;
}

/**
 * Tick what you played, say where (optional), and each ticked sender sees Played out. Nothing is ticked for you.
 * `promptOpen`: the Monday question is open this week, so "None this weekend" can close it.
 * `children`: the evaluation-only note, shown under the list.
 * Option 65 A (owner, 19 Nov): 60px rows with a round tick, the whole row the target, a real checkbox underneath for
 * screen readers and keyboards. Phones: the buttons sit in a bar pinned above the player and menu pair; while the Where
 * field has focus the bar drops back into the page, so the keyboard never pushes it over the field. Laptop: one card,
 * the buttons side by side.
 */
export function PickForm({ tracks, promptOpen, children }: { tracks: PromptTrack[]; promptOpen: boolean; children?: React.ReactNode }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [typing, setTyping] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const pairH = usePairHeight();
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const btn = "inline-flex min-h-12 w-full items-center justify-center rounded-[14px] px-5 text-[15px] font-semibold transition md:min-h-11 md:w-auto md:text-[14px]";
  const quiet = `${btn} border border-line bg-well text-bone disabled:text-mute`;
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (!picked.length) return;
        start(async () => {
          try {
            const n = await playedOutBatch(picked, note, "pick");
            toast.show({ message: n ? `${n} sender${n === 1 ? "" : "s"} will see Played out` : "Nothing changed" });
            router.push("/dashboard/floor");
          } catch {
            toast.show({ message: "Couldn't tell the senders, so nothing changed. Try again.", tone: "error" });
          }
        });
      }}
    >
      {/* Phones: hairline rows on the page, a ticked row on the card colour. Laptop: the rows in one card, a ticked row on the well. */}
      <ul className="divide-y divide-line md:rounded-[18px] md:border md:border-line md:bg-card md:p-1.5 md:shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)]">
        {tracks.map((t) => {
          const on = picked.includes(t.id);
          return (
            <li key={t.id}>
              <label className={`-mx-2 flex min-h-[60px] cursor-pointer items-center gap-3 rounded-[12px] px-2 py-2.5 md:mx-0 ${on ? "bg-card md:bg-well" : "md:hover:bg-well/60"}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(t.id)} className="sr-only outline-none" />
                <span
                  aria-hidden
                  className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${on ? "border-lime bg-lime text-[#10110f]" : "border-line-2"}`}
                >
                  {on && (
                    <svg viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5l4.5 4.5L19 7.5" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-bone">{t.title}</span>
                  <span className="block truncate text-[12.5px] text-mute">
                    {t.artist}
                    {t.bpm ? ` · ${Math.round(t.bpm)} BPM` : ""}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {children}
      <label className="flex flex-col gap-1.5 text-[13px] text-mute">
        Where (optional, the senders see it)
        <input
          className="input max-md:text-base"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onFocus={() => setTyping(true)}
          onBlur={() => setTyping(false)}
          maxLength={140}
          placeholder="Sample Club, Saturday"
        />
      </label>
      {/* Phones: pinned above the pair while the list scrolls under it (sticky, so the last row and the field always
          scroll clear of it). Laptop: in the page, side by side. */}
      <div
        style={{ "--pair-h": `${pairH}px` } as React.CSSProperties}
        className={`${typing ? "static" : "sticky"} bottom-[calc(max(0.75rem,env(safe-area-inset-bottom))+var(--pair-h)+8px)] z-[35] -mx-4 flex flex-col gap-2 border-t border-line bg-ink px-4 py-3 md:static md:mx-0 md:flex-row md:border-0 md:bg-transparent md:p-0`}
      >
        <button className={picked.length ? `${btn} bg-lime text-[#10110f] disabled:opacity-80` : quiet} disabled={pending || !picked.length}>
          {pending ? "Telling them…" : picked.length ? `Tell ${picked.length} sender${picked.length === 1 ? "" : "s"}: Played out` : "Tick what you played"}
        </button>
        {promptOpen && (
          <button
            type="button"
            className={quiet}
            disabled={pending}
            onClick={() =>
              start(async () => {
                await skipPlayedOutPrompt();
                router.push("/dashboard/floor");
              })
            }
          >
            None this weekend
          </button>
        )}
      </div>
    </form>
  );
}
