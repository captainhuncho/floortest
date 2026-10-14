"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { PlayIcon } from "./Player";

/** A right-aligned readout after the title (BPM, length, age). Tabular, so a column of rows lines up. */
export type TrackColumn = {
  key: string;
  value: ReactNode;
  /** A Tailwind width so every row's column lines up ("w-14"). Leave out to size to the content. */
  width?: string;
  /** Hide below this breakpoint (phones keep the row short). */
  from?: "sm" | "md" | "lg";
  /** Read before the value by screen readers when the value alone is ambiguous ("Length"). */
  label?: string;
  /** Bone instead of faint, for the readout that matters most in this list. */
  strong?: boolean;
};

export type TrackRowProps = {
  title: string;
  artist?: string | null;
  genre?: string | null;
  /** Replaces the `artist · genre` line (for "via sender", a collection name…). */
  sub?: ReactNode;
  /** The title opens this (the track in the Queue, usually). */
  href?: string;
  /** Shows the play dot. `playing` is this row's track playing right now. */
  onPlay?: () => void;
  playing?: boolean;
  /** Right-aligned readouts, in order. */
  columns?: TrackColumn[];
  /** A waveform (or any wide picture of the track): shown only from 1024px up, where there's room. */
  waveform?: ReactNode;
  /** A neutral text tag: "Kept", "Not for me", "Played out". Plain words, never an icon or a colour. */
  status?: ReactNode;
  /** Buttons or a menu at the end of the row. */
  actions?: ReactNode;
  /** The row being looked at (the open track): a bone bar on the leading edge and a raised surface. */
  selected?: boolean;
  /** `card`: its own bordered card (lists of cards). `row`: no box, for rows inside a list or panel that draws dividers. */
  surface?: "card" | "row";
  as?: "li" | "div";
  /** Anything under the row at full width (a played-out line, a note, a phone-only waveform). */
  children?: ReactNode;
  className?: string;
};

/** The neutral status tag on a TrackRow (and anywhere a track's state is named in words). */
export function TrackTag({ children }: { children: ReactNode }) {
  return <span className="inline-flex shrink-0 items-center rounded border border-line-2 px-1.5 py-0.5 text-[11px] font-bold leading-none text-bone">{children}</span>;
}

const FROM = { sm: "hidden sm:block", md: "hidden md:block", lg: "hidden lg:block" } as const;

/**
 * One track, one line: play dot, the title over `artist · genre`, then optional readouts, a status tag and actions.
 * The title always comes first and always reads bone; everything after it is quieter. Built from the Prepare rows
 * (Figma "track-card") so the Queue list, Prepare, collection detail and the Floor's Up next share one row.
 */
export function TrackRow({
  title,
  artist,
  genre,
  sub,
  href,
  onPlay,
  playing = false,
  columns,
  waveform,
  status,
  actions,
  selected = false,
  surface = "card",
  as: Tag = "li",
  children,
  className = "",
}: TrackRowProps) {
  const line = sub ?? [artist, genre].filter(Boolean).join(" · ");
  const name = (
    <>
      <span className="truncate text-body font-bold text-bone">{title}</span>
      {line ? <span className="truncate text-xs text-faint">{line}</span> : null}
    </>
  );
  const box =
    surface === "card"
      ? `card px-3 py-3 md:px-4 ${selected ? "bg-ink-4" : ""}`
      : `px-3 py-2.5 ${selected ? "bg-ink-4" : ""}`;

  return (
    <Tag
      data-selected={selected ? "" : undefined}
      className={`flex flex-col gap-2 ${box} ${selected ? "shadow-[inset_2px_0_0_var(--color-bone)]" : ""} ${className}`}
    >
      <div className="flex min-w-0 items-center gap-3">
        {onPlay && (
          // The dot is 32px; the button around it is a 44px target on touch screens.
          <button
            type="button"
            onClick={onPlay}
            aria-label={playing ? `Pause ${title}` : `Play ${title}`}
            className="grid size-8 shrink-0 place-items-center rounded-full pointer-coarse:-m-1.5 pointer-coarse:size-11"
          >
            <span className="play-dot grid size-8 place-items-center rounded-full">
              {playing ? (
                <PlayIcon playing className="size-3" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/icons/play.svg" alt="" className="size-3" />
              )}
            </span>
          </button>
        )}
        {href ? (
          <Link href={href} aria-current={selected ? "true" : undefined} className="flex min-w-0 flex-1 flex-col gap-0.5">
            {name}
          </Link>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">{name}</div>
        )}
        {waveform ? <div className="hidden shrink-0 lg:block lg:w-48 xl:w-64">{waveform}</div> : null}
        {status ? <TrackTag>{status}</TrackTag> : null}
        {columns?.map((c) => (
          <span
            key={c.key}
            className={`shrink-0 text-right text-[11px] tnum ${c.strong ? "font-bold text-bone" : "text-faint"} ${c.width ?? ""} ${c.from ? FROM[c.from] : ""}`}
          >
            {c.label ? <span className="sr-only">{c.label} </span> : null}
            {c.value}
          </span>
        ))}
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </Tag>
  );
}
