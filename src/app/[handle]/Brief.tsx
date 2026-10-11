"use client";

import type { BriefItem } from "@/lib/brief";

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
    <section aria-label="What they're looking for" className="flex flex-col gap-3 border-t border-line pt-4 group-has-[[data-picked]]/page:hidden">
      <p className="eyebrow">{heading}</p>
      {genres.length > 0 && (
        <div role="group" aria-label="Genre of your track" className="flex flex-wrap gap-1.5">
          {genres.map((g) => {
            const on = picked === g;
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => onPick(on ? "" : g)}
                className={`tap-tall rounded-full border px-3 py-1.5 text-[12px] font-bold transition-colors duration-150 ${
                  on ? "border-bone bg-bone text-ink" : "border-line bg-ink-2 text-bone hover:border-line-2"
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      )}
      {items.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px] leading-5">
          {items.map((b) => (
            <div key={b.key} className="contents">
              <dt className="text-[11px] font-bold uppercase leading-5 tracking-[1px] text-mute">{b.label}</dt>
              <dd className={b.key === "note" ? "text-mute" : "font-bold"}>{b.text}</dd>
            </div>
          ))}
        </dl>
      )}
      {genres.length > 0 && <p className="text-[12px] text-dim">Tap the genre your track fits; it carries into the form.</p>}
      {shareNote && <p className="text-[12px] text-dim">{shareNote}</p>}
    </section>
  );
}
