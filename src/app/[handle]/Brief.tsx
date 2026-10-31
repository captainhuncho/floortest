"use client";

import type { BriefItem } from "@/lib/brief";
import { CARD, Icon, InfoRow, type IconName } from "@/components/Kit";

const ROW_ICON: Partial<Record<BriefItem["key"], IconName>> = { bpm: "wave", wanted: "tag", deadline: "cal" };

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
  const rows = items.filter((b) => b.key !== "note");
  const note = items.find((b) => b.key === "note");
  return (
    <section aria-label="What they're looking for" className={`${CARD} flex flex-col gap-2.5 p-3 group-has-[[data-picked]]/page:hidden`}>
      <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em] text-bone">
        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-line bg-well">
          <Icon name="tag" className="size-4" />
        </span>
        {heading}
      </h2>
      {genres.length > 0 && (
        <div role="group" aria-label="Genre of your track" className="flex flex-wrap gap-x-1.5 gap-y-2">
          {genres.map((g) => {
            const on = picked === g;
            return (
              <button
                key={g}
                type="button"
                aria-pressed={on}
                onClick={() => onPick(on ? "" : g)}
                className={`relative h-9 whitespace-nowrap rounded-[10px] border px-3 text-[13px] font-semibold transition-colors duration-150 before:absolute before:-inset-x-[3px] before:-inset-y-1 ${
                  on ? "border-lime/45 bg-lime/12 text-lime" : "border-line bg-well text-bone hover:border-line-2"
                }`}
              >
                {g}
              </button>
            );
          })}
        </div>
      )}
      {genres.length > 0 && <p className="text-[11.5px] text-dim">Tap the genre your track fits; it carries into the form.</p>}
      {(rows.length > 0 || note) && (
        <dl className="flex flex-col gap-1.5">
          {rows.map((b) => (
            <InfoRow key={b.key} icon={ROW_ICON[b.key] ?? "tag"} label={b.label}>
              <span className="whitespace-normal">{b.text}</span>
            </InfoRow>
          ))}
          {note && (
            <div className="mt-0.5 border-l-2 border-line-2 py-0.5 pl-3">
              <dt className="sr-only">{note.label}</dt>
              <dd className="text-[13px] leading-5 text-mute">{note.text}</dd>
            </div>
          )}
        </dl>
      )}
      {shareNote && <p className="text-[11.5px] text-dim">{shareNote}</p>}
    </section>
  );
}
