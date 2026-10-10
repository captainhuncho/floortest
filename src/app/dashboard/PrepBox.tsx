"use client";

import { useState, useTransition } from "react";
import { usePlayer, type PlayerTrack } from "@/components/Player";
import { useToast } from "@/components/Toast";
import { fmtCue, MAX_CUES, type Cue } from "@/lib/cues";
import { savePrep } from "./actions/review";

/** Set prep on a kept track: energy 1–5 and labelled cue points. Both go into the Rekordbox export. */
export function PrepBox({ track, energy: initialEnergy, cues: initialCues }: { track: PlayerTrack; energy: number | null; cues: Cue[] }) {
  const player = usePlayer();
  const [energy, setEnergy] = useState(initialEnergy);
  const [cues, setCues] = useState(initialCues);
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const on = player.current?.id === track.id;
  const d = (on && player.duration) || track.duration || 0;

  const change = (e: number | null, c: Cue[]) => {
    setEnergy(e);
    setCues(c);
    setDirty(true);
  };
  const addCue = () => {
    const at = Math.round(player.time * 10) / 10;
    if (cues.some((c) => Math.abs(c.at - at) < 0.5)) return;
    change(energy, [...cues, { at, label: "" }].sort((a, b) => a.at - b.at).slice(0, MAX_CUES));
  };
  const jump = (at: number) => {
    if (!on) player.play(track);
    if (d) setTimeout(() => player.seek(at / d), on ? 0 : 250);
  };

  return (
    <section aria-label="Set prep" className="rounded-xl border border-line bg-ink-2 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="eyebrow">Set prep</h3>
        {dirty && (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await savePrep(track.id, energy, cues);
                setDirty(false);
                toast.show({ message: "Prep saved. It goes into your crate export." });
              })
            }
            className="rounded-md bg-lime px-3 py-1 text-[11px] font-bold text-ink"
          >
            {pending ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <span className="w-14 shrink-0 text-[11px] text-faint">Energy</span>
        <div className="flex gap-1" role="radiogroup" aria-label="Energy">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={energy === n}
              onClick={() => change(energy === n ? null : n, cues)}
              className={`grid size-8 place-items-center rounded-md border text-[12px] font-bold transition ${
                energy && n <= energy ? "border-bone bg-bone text-ink" : "border-line text-mute hover:text-bone"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[11px] text-faint">
            Cues {cues.length}/{MAX_CUES}
          </span>
          {on ? (
            <button
              type="button"
              disabled={cues.length >= MAX_CUES}
              onClick={addCue}
              className="rounded-md border border-line px-2.5 py-1 text-[11px] font-bold hover:border-lime hover:text-lime disabled:opacity-40"
            >
              + Cue at {fmtCue(player.time)}
            </button>
          ) : (
            <button type="button" onClick={() => player.play(track)} className="text-[11px] text-mute underline-offset-4 hover:text-bone hover:underline">
              Play to mark cues
            </button>
          )}
        </div>
        {cues.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {cues.map((c, i) => (
              <li key={c.at} className="flex items-center gap-2">
                <button type="button" onClick={() => jump(c.at)} className="w-12 shrink-0 rounded bg-ink-4 px-1.5 py-1 text-center text-[11px] font-bold tnum hover:text-lime" aria-label={`Jump to ${fmtCue(c.at)}`}>
                  {fmtCue(c.at)}
                </button>
                <input
                  value={c.label}
                  maxLength={40}
                  placeholder="Label (drop, break, mix out…)"
                  aria-label={`Label for the cue at ${fmtCue(c.at)}`}
                  onChange={(e) => change(energy, cues.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                  className="input min-w-0 flex-1 py-1 text-[11px]"
                />
                <button type="button" onClick={() => change(energy, cues.filter((_, j) => j !== i))} aria-label={`Remove the cue at ${fmtCue(c.at)}`} className="px-1 text-mute hover:text-danger">
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
