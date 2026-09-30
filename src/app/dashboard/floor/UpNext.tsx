"use client";

import Link from "next/link";
import { PlayIcon, usePlayer } from "@/components/Player";
import { fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";

type Item = { id: number; title: string; artist: string; sender: string; genre: string; duration: number | null; peaks: number[] | null; played: boolean };

/** The oldest tracks still waiting for a decision, playable in place (Figma "Up Next Card" track rows). */
export function UpNext({ items }: { items: Item[] }) {
  const { current, playing, play } = usePlayer();
  const queue = items.map(toPlayer);
  return (
    <ul className="space-y-2">
      {items.map((t) => {
        const on = current?.id === t.id;
        return (
          <li key={t.id} className="flex items-center gap-3 rounded-xl bg-ink-2 p-3">
            <button
              onClick={() => play(toPlayer(t), queue)}
              className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-ink"
              aria-label={on && playing ? `Pause ${t.title}` : `Play ${t.title}`}
            >
              {on && playing ? (
                <PlayIcon playing className="h-4 w-4" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src="/icons/play.svg" alt="" className="size-4" />
              )}
            </button>
            <Link href={`/dashboard?view=queue&t=${t.id}`} className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="truncate text-sm font-bold tracking-[-0.4px] text-bone">
                {t.artist} - {t.title}
              </span>
              <span className="truncate text-[11px] text-faint">
                {[t.genre, t.sender !== t.artist ? `via ${t.sender}` : null].filter(Boolean).join(" · ")}
              </span>
            </Link>
            <span className="shrink-0 text-[13px] text-faint tnum">{fmtTime(t.duration)}</span>
          </li>
        );
      })}
    </ul>
  );
}
