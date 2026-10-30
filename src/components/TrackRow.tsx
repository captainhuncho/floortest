"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { fmtTime } from "@/lib/format";
import { Chip } from "./Kit";
import { PlayIcon } from "./Player";

/** A right-aligned readout after the title (BPM, length, age). Tabular, so a column of rows lines up. */
export type TrackColumn = {
  key: string;
  value: ReactNode;
  /** A Tailwind width so every row's column lines up ("w-14"). Leave out to size to the content. */
  width?: string;
  /** Hide below this breakpoint (phones keep the row short). Measured on the row itself with `fit="container"`. */
  from?: "sm" | "md" | "lg" | "xl";
  /** Read before the value by screen readers when the value alone is ambiguous ("Length"). */
  label?: string;
  /** Bone instead of faint, for the readout that matters most in this list. */
  strong?: boolean;
  /** Shown on hover (the full date behind an age). */
  title?: string;
};

export type TrackRowProps = {
  title: string;
  artist?: string | null;
  genre?: string | null;
  /** Replaces the `artist · genre` line (for "via sender", a collection name…). */
  sub?: ReactNode;
  /** The title opens this (the track in the Queue, usually). */
  href?: string;
  /** With `href`: false keeps the scroll position when the link opens (the Queue's side list). */
  scroll?: boolean;
  /** Without `href`: the title is a button that opens something under the row (a reply panel); `open` is its state. */
  onOpen?: () => void;
  open?: boolean;
  /** Still waiting for a decision: a small bone dot before the title, read out as "Needs review". Neutral, never lime. */
  waiting?: boolean;
  /** Shows the play dot. `playing` is this row's track playing right now. */
  onPlay?: () => void;
  playing?: boolean;
  /** Right-aligned readouts, in order. */
  columns?: TrackColumn[];
  /** A waveform (or any wide picture of the track): shown only from 1024px up, where there's room. */
  waveform?: ReactNode;
  /**
   * A status tag in words: "Kept", "Not for me", "Played out", "Needs review". The words carry the meaning; the chip's
   * tint follows the redesign (green kept, lime played out, amber needs review, plain otherwise). Several tags as an
   * array (empty entries are skipped).
   */
  status?: ReactNode | ReactNode[];
  /** Buttons or a menu at the end of the row. */
  actions?: ReactNode;
  /** Narrow rows: the actions take their own line under the title (rows with several buttons). See STACK. */
  stackActions?: boolean;
  /**
   * What `from` and the waveform measure: the window (default) or the row itself (`container`, for a list that sits
   * beside a panel, like the Queue's). The waveform still needs a 1024px window either way.
   */
  fit?: "viewport" | "container";
  /** The row being looked at (the open track): a bone bar on the leading edge and a raised surface. */
  selected?: boolean;
  /** `card`: its own bordered card (lists of cards). `row`: no box, for rows inside a list or panel that draws dividers. */
  surface?: "card" | "row";
  as?: "li" | "div";
  /** Anything under the row at full width (a played-out line, a note, a reply panel). */
  children?: ReactNode;
  className?: string;
};

/** A track's age for the age column: "5m", "3h", "3d", "2mo", "1y". */
export function trackAge(ts: number, now = Date.now()) {
  const m = Math.max(1, Math.round((now - ts) / 60000));
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d`;
  const mo = Math.round(d / 30);
  return mo < 12 ? `${mo}mo` : `${Math.round(mo / 12)}y`;
}

/** The three readouts most track lists share, in this order: BPM, length, age (each optional per list). */
export function trackColumns(
  t: { bpm?: number | null; duration?: number | null; createdAt?: number },
  opts: { bpm?: TrackColumn["from"] | false; length?: TrackColumn["from"] | false; age?: TrackColumn["from"] | false } = {},
): TrackColumn[] {
  const cols: TrackColumn[] = [];
  if (opts.bpm !== false) cols.push({ key: "bpm", label: "BPM", value: t.bpm ? `${Math.round(t.bpm)} BPM` : "", width: "w-14", from: opts.bpm ?? "sm" });
  if (opts.length !== false) cols.push({ key: "length", label: "Length", value: fmtTime(t.duration), width: "w-10", from: opts.length || undefined });
  if (opts.age !== false && t.createdAt)
    cols.push({ key: "age", label: "Age", value: trackAge(t.createdAt), width: "w-9", from: opts.age || undefined, title: new Date(t.createdAt).toLocaleString() });
  return cols;
}

const TAG_TONE: Record<string, "up" | "acc" | "warn"> = { Kept: "up", "Played out": "acc", "Needs review": "warn" };

/** The status tag on a TrackRow (and anywhere a track's state is named in words): the kit's chip, tinted by the word. */
export function TrackTag({ children }: { children: ReactNode }) {
  return <Chip tone={typeof children === "string" ? (TAG_TONE[children] ?? "flat") : "flat"}>{children}</Chip>;
}

const FROM = {
  viewport: { sm: "hidden sm:block", md: "hidden md:block", lg: "hidden lg:block", xl: "hidden xl:block" },
  // The row's own width: 448px, 576px, 768px and 1024px.
  container: { sm: "hidden @md:block", md: "hidden @xl:block", lg: "hidden @3xl:block", xl: "hidden @5xl:block" },
} as const;
const WAVE = {
  viewport: "hidden lg:block lg:w-48 xl:w-64",
  container: "hidden lg:@4xl:block lg:@4xl:w-40 lg:@6xl:w-56",
} as const;
/** Rows with several buttons: where the actions drop to their own line (under 768px of window, or 672px of row). */
const STACK = {
  viewport: { row: "max-md:flex-wrap max-md:gap-y-1", actions: "max-md:basis-full max-md:justify-between max-md:gap-1" },
  container: { row: "@max-2xl:flex-wrap @max-2xl:gap-y-1", actions: "@max-2xl:basis-full @max-2xl:justify-between @max-2xl:gap-1" },
} as const;

/**
 * One track, one line: play dot, the title over `artist · genre`, then optional readouts, a status tag and actions.
 * The title always comes first and always reads bone; everything after it is quieter. Built from the Prepare rows
 * (Figma "track-card") so the Queue list, the Queue's side list, Prepare, collection detail and the Floor's Up next
 * share one row.
 */
export function TrackRow({
  title,
  artist,
  genre,
  sub,
  href,
  scroll,
  onOpen,
  open,
  waiting = false,
  onPlay,
  playing = false,
  columns,
  waveform,
  status,
  actions,
  stackActions = false,
  fit = "viewport",
  selected = false,
  surface = "card",
  as: Tag = "li",
  children,
  className = "",
}: TrackRowProps) {
  const line = sub ?? [artist, genre].filter(Boolean).join(" · ");
  const tags = (Array.isArray(status) ? status : [status]).filter((t) => t != null && t !== false && t !== "");
  const name = (
    <>
      <span className="flex min-w-0 items-center gap-1.5">
        {waiting && (
          <>
            <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-bone" />
            <span className="sr-only">Needs review: </span>
          </>
        )}
        <span className="truncate text-[13px] font-semibold text-bone">{title}</span>
      </span>
      {line ? <span className="truncate text-[11.5px] text-mute">{line}</span> : null}
    </>
  );
  const box =
    surface === "card"
      ? `card px-3 py-3 md:px-4 ${selected ? "bg-ink-4" : ""}`
      : `px-3 py-2.5 ${selected ? "bg-ink-4" : ""}`;

  return (
    <Tag
      data-selected={selected ? "" : undefined}
      className={`flex flex-col gap-2 ${fit === "container" ? "@container" : ""} ${box} ${selected ? "shadow-[inset_2px_0_0_var(--color-bone)]" : ""} ${className}`}
    >
      <div className={`flex min-w-0 items-center gap-3 ${stackActions ? STACK[fit].row : ""}`}>
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
          <Link href={href} scroll={scroll} aria-current={selected ? "true" : undefined} className="flex min-w-0 flex-1 flex-col gap-0.5">
            {name}
          </Link>
        ) : onOpen ? (
          <button type="button" onClick={onOpen} aria-expanded={!!open} className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
            {name}
          </button>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">{name}</div>
        )}
        {waveform ? <div className={`shrink-0 ${WAVE[fit]}`}>{waveform}</div> : null}
        {tags.map((t, i) => (
          <TrackTag key={i}>{t}</TrackTag>
        ))}
        {columns?.map((c) => (
          <span
            key={c.key}
            title={c.title}
            // Ages ("3d") and dates are worked out against the clock, which moves between server and browser.
            suppressHydrationWarning
            className={`shrink-0 text-right text-[11px] tnum ${c.strong ? "font-bold text-bone" : "text-faint"} ${c.width ?? ""} ${c.from ? FROM[fit][c.from] : ""}`}
          >
            {c.label ? <span className="sr-only">{c.label} </span> : null}
            {c.value}
          </span>
        ))}
        {actions ? (
          <div className={`flex shrink-0 items-center gap-2 ${stackActions ? STACK[fit].actions : ""}`}>{actions}</div>
        ) : null}
      </div>
      {children}
    </Tag>
  );
}
