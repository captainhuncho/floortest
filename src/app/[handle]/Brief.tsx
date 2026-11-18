"use client";

import type { BriefItem } from "@/lib/brief";
import { chip } from "./Choice";

/**
 * The receiver's brief on their link: only what they actually asked for (their own genres, BPM, what's wanted, the note).
 * Genres are a choice, not decoration: tapping one carries it into the form as the track's genre.
 */
export function Brief({
  heading,
  genres,
  items,
  picked,
  onPick,
  shareNote,
}: {
  heading: React.ReactNode;
  /** The collection's own genres; empty when it uses the default list (then no genres are claimed here). */
  genres: string[];
  items: BriefItem[];
  picked: string;
  onPick: (genre: string) => void;
  shareNote?: string | null;
}) {
  if (!genres.length && !items.length && !shareNote) return null;
  return (
    <section aria-label="What they're looking for" className="flex flex-col gap-2.5 rounded-2xl border border-line bg-card p-3.5 group-has-[[data-picked]]/page:hidden">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mute">{heading}</h2>
      {genres.length > 0 && (
        <div role="group" aria-label="Genre of your track" className="flex flex-wrap gap-1.5">
          {genres.map((g) => {
            const on = picked === g;
            return (
              <button key={g} type="button" aria-pressed={on} onClick={() => onPick(on ? "" : g)} className={chip(on)}>
                {g}
              </button>
            );
          })}
        </div>
      )}
      {items.length > 0 && (
        <dl className="flex flex-col gap-1 text-[14px] leading-5 text-mute">
          {items.map((b) => (
            <div key={b.key}>
              <dt className="sr-only">{b.label}</dt>
              <dd className={b.key === "bpm" ? "font-semibold text-bone" : "whitespace-pre-wrap break-words"}>{b.key === "bpm" ? `${b.text} BPM` : b.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {shareNote && <p className="text-[12px] text-dim">{shareNote}</p>}
    </section>
  );
}
