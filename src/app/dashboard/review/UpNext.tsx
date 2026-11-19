"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { PlayerWaveform, PlayIcon, usePlayer } from "@/components/Player";
import { fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";
import { useRenderProbe } from "@/lib/render-probe";
import type { Row } from "../TrackList";
import { useQueue } from "./QueueState";

type SortKey = "title" | "genre" | "bpm" | "duration";
type Sort = { key: SortKey; dir: 1 | -1 } | null;

/** Number, title and artist, wave, genre, BPM, time. Under 1180px the wave and genre step out. */
const GRID =
  "grid grid-cols-[28px_minmax(0,1fr)_44px_48px] items-center gap-x-3 min-[1180px]:grid-cols-[28px_minmax(180px,260px)_minmax(140px,1fr)_110px_44px_48px] min-[1180px]:gap-x-5";

const HEADS: { key: SortKey; label: string; className: string }[] = [
  { key: "title", label: "Title", className: "flex justify-start" },
  { key: "genre", label: "Genre", className: "hidden justify-start min-[1180px]:col-start-4 min-[1180px]:flex" },
  { key: "bpm", label: "BPM", className: "flex justify-end" },
  { key: "duration", label: "Time", className: "flex justify-end" },
];

/** Sorts a copy of the rows already on the page; nothing about the order goes to the server. */
function sorted(rows: Row[], sort: Sort) {
  if (!sort) return rows;
  const { key, dir } = sort;
  const text = key === "title" || key === "genre";
  return rows.toSorted((a, b) => {
    const x = a[key];
    const y = b[key];
    // Rows with nothing in this column sit last, whichever way the column runs.
    if (x == null || x === "") return y == null || y === "" ? 0 : 1;
    if (y == null || y === "") return -1;
    return dir * (text ? String(x).localeCompare(String(y), undefined, { sensitivity: "base" }) : Number(x) - Number(y));
  });
}

const statusWord = (d: Row["decision"]) => (d === "kept" ? "Kept" : d === "passed" ? "Not for me" : "Waiting");

/**
 * The Queue's playlist (Design option 42): no artwork and no play button. A row plays its track from the start and
 * opens it for review; the wave of the playing track seeks. The column heads sort the rows on the page.
 * `showStatus`: the Kept / Not for me / Waiting word under the artist, only on the All tab.
 */
export function UpNext({ rows, selectedId, hrefFor, showStatus = false }: { rows: Row[]; selectedId: number | null; hrefFor: Record<number, string>; showStatus?: boolean }) {
  const { current, playing, duration, play, seek } = usePlayer();
  useRenderProbe("UpNext");
  const state = useQueue();
  const [sort, setSort] = useState<Sort>(null);
  const shown = sorted(state ? rows.filter((r) => !state.gone.has(r.id)) : rows, sort);
  const openId = state?.shown?.id ?? selectedId;
  const queue = shown.map(toPlayer);

  // First press sorts up, the second down, the third puts the served order back.
  const press = (key: SortKey) => setSort((s) => (s?.key !== key ? { key, dir: 1 } : s.dir === 1 ? { key, dir: -1 } : null));
  const pick = (e: React.MouseEvent, r: Row) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    state?.show({ ...toPlayer(r), genre: r.genre, bpm: r.bpm });
    play(toPlayer(r), queue);
  };

  return (
    <div role="table" aria-label="Up next" className="flex flex-col">
      <div role="row" className={`${GRID} border-b border-line px-2 text-[11px] font-semibold text-mute`}>
        <span role="columnheader" className="text-right tnum">
          #
        </span>
        {HEADS.map((h) => {
          const on = sort?.key === h.key;
          return (
            <span key={h.key} role="columnheader" aria-sort={on ? (sort.dir === 1 ? "ascending" : "descending") : "none"} className={`min-w-0 ${h.className}`}>
              <button type="button" onClick={() => press(h.key)} className="-mx-1 inline-flex min-h-11 items-center gap-1 rounded-md px-1 hover:text-bone">
                {h.label}
                <span aria-hidden className="w-2 text-[9px]">
                  {on ? (sort.dir === 1 ? "▲" : "▼") : ""}
                </span>
              </button>
            </span>
          );
        })}
      </div>
      {shown.map((r, i) => {
        // Folder heads only make sense in the served order, where a folder's tracks sit together.
        const header = !sort && r.release && r.release.id !== shown[i - 1]?.release?.id;
        const isCurrent = current?.id === r.id;
        const open = openId === r.id;
        const d = (isCurrent && duration) || r.duration || 0;
        return (
          <Fragment key={r.id}>
            {header && (
              <div role="row" className="mt-1 flex items-baseline gap-2 rounded-[10px] bg-well px-2.5 py-1.5 text-[12px]">
                <span role="cell" className="flex min-w-0 items-baseline gap-2">
                  <span className="text-[11px] font-semibold text-mute">Folder</span>
                  <span className="min-w-0 truncate font-semibold text-bone">{r.release!.title}</span>
                  <span className="shrink-0 text-[11px] text-mute tnum">· {r.release!.count} tracks</span>
                </span>
              </div>
            )}
            <div
              role="row"
              aria-current={open ? "true" : undefined}
              className={`${GRID} relative min-h-14 rounded-xl px-2 py-1.5 transition-colors duration-100 ${isCurrent || open ? "bg-well" : "hover:bg-well/60"}`}
            >
              <span role="cell" className={`grid place-items-center text-right text-[12px] tnum ${isCurrent ? "text-lime" : "text-mute"}`}>
                {isCurrent ? <PlayIcon playing={playing} className="size-3" /> : i + 1}
              </span>
              <span role="cell" className="min-w-0">
                {/* The link's ::after covers the row, so the whole row plays; the wave sits above it once it seeks. */}
                <Link
                  href={hrefFor[r.id]}
                  scroll={false}
                  onClick={(e) => pick(e, r)}
                  aria-label={`Play ${r.title}${r.artist ? `, ${r.artist}` : ""}`}
                  className="flex min-w-0 flex-col gap-0.5 rounded-sm after:absolute after:inset-0"
                >
                  <span className="truncate text-[13px] font-semibold text-bone">{r.title}</span>
                  <span className="truncate text-[11.5px] text-mute">
                    {r.artist}
                    {showStatus && ` · ${statusWord(r.decision)}`}
                  </span>
                </Link>
              </span>
              <span role="cell" className={`hidden min-w-0 min-[1180px]:block ${isCurrent ? "relative z-10" : ""}`}>
                <PlayerWaveform on={isCurrent} length={d} peaks={r.peaks} height={28} onSeek={isCurrent ? seek : undefined} label={isCurrent ? `Seek ${r.title}` : undefined} dim={!!r.decision && !isCurrent} />
              </span>
              <span role="cell" className="hidden truncate text-[12px] text-mute min-[1180px]:block">
                {r.genre}
              </span>
              <span role="cell" className="text-right text-[12px] text-mute tnum">
                {r.bpm ? Math.round(r.bpm) : ""}
              </span>
              <span role="cell" className="text-right text-[12px] text-mute tnum">
                {fmtTime(r.duration)}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
