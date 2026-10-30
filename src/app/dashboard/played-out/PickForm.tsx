"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { playedOutBatch, skipPlayedOutPrompt } from "../actions/review";
import type { PromptTrack } from "@/lib/played-out-prompt";
import { CARD } from "@/components/Kit";

/**
 * Tick what you played, say where (optional), and each ticked sender sees Played out. Nothing is ticked for you.
 * `promptOpen`: the Monday question is open this week, so "None this weekend" can close it.
 */
export function PickForm({ tracks, promptOpen }: { tracks: PromptTrack[]; promptOpen: boolean }) {
  const [picked, setPicked] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const toast = useToast();
  const toggle = (id: number) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
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
            toast.show({ message: "Couldn't save that. Nothing changed. Try again." });
          }
        });
      }}
    >
      {/* One card of hairline rows, like Prepare's kept list; a ticked row sits on the well. */}
      <ul className={`${CARD} divide-y divide-line overflow-hidden`}>
        {tracks.map((t) => {
          const on = picked.includes(t.id);
          return (
            <li key={t.id}>
              <label className={`flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2.5 ${on ? "bg-well" : "hover:bg-well/60"}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(t.id)} className="size-5 shrink-0 accent-[var(--color-lime)]" />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold text-bone">{t.title}</span>
                  <span className="block truncate text-[11.5px] text-mute">
                    {t.artist}
                    {t.bpm ? ` · ${Math.round(t.bpm)} BPM` : ""}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <label className="flex flex-col gap-1.5 text-[11.5px] text-mute">
        Where (optional, the senders see it)
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="Sample Club, Saturday" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn-lime min-h-11 rounded-[13px]" disabled={pending || !picked.length}>
          {pending ? "Telling them…" : picked.length ? `Tell ${picked.length} sender${picked.length === 1 ? "" : "s"}: Played out` : "Tick what you played"}
        </button>
        {promptOpen && (
          <button
            type="button"
            className="btn-ghost min-h-11 rounded-[13px] bg-well"
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
