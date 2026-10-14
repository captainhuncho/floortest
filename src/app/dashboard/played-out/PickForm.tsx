"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useToast } from "@/components/Toast";
import { playedOutBatch, skipPlayedOutPrompt } from "../actions/review";
import type { PromptTrack } from "@/lib/played-out-prompt";

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
      className="flex flex-col gap-5"
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
      <ul className="flex flex-col gap-2">
        {tracks.map((t) => {
          const on = picked.includes(t.id);
          return (
            <li key={t.id}>
              <label className={`flex min-h-14 cursor-pointer items-center gap-3.5 rounded-xl border px-4 py-3 ${on ? "border-mute bg-ink-3" : "border-line hover:border-line-2"}`}>
                <input type="checkbox" checked={on} onChange={() => toggle(t.id)} className="size-5 shrink-0 accent-[var(--color-lime)]" />
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-bold text-bone">{t.title}</span>
                  <span className="block truncate text-[12px] text-mute">
                    {t.artist}
                    {t.bpm ? ` · ${Math.round(t.bpm)} BPM` : ""}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <label className="flex flex-col gap-1.5 text-[12px] text-mute">
        Where (optional, the senders see it)
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} maxLength={140} placeholder="Sample Club, Saturday" />
      </label>
      <div className="flex flex-wrap gap-2">
        <button className="btn-lime" disabled={pending || !picked.length}>
          {pending ? "Telling them…" : picked.length ? `Tell ${picked.length} sender${picked.length === 1 ? "" : "s"}: Played out` : "Tick what you played"}
        </button>
        {promptOpen && (
          <button
            type="button"
            className="btn-ghost"
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
