"use client";

import Link from "next/link";
import { PlayIcon, usePlayer } from "@/components/Player";
import { fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";

type Item = { id: number; title: string; artist: string; sender: string; genre: string; duration: number | null; peaks: number[] | null; played: boolean; age?: string };

/** The newest tracks still waiting for a decision, playable in place: one flat panel, a hairline between rows (rule 15 Floor, 28 Oct). */
export function UpNext({ items }: { items: Item[] }) {
  const { current, playing, play } = usePlayer();
  const queue = items.map(toPlayer);
  return (
    <ul className="panel divide-y divide-line overflow-hidden">
      {items.map((t) => {
        const on = current?.id === t.id;
        return (
          <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            <button
              onClick={() => play(toPlayer(t), queue)}
              className="grid size-11 shrink-0 place-items-center rounded-lg border border-line text-bone hover:border-mute hover:bg-ink-4"
              aria-label={on && playing ? `Pause ${t.title}` : `Play ${t.title}`}
            >
              <PlayIcon playing={on && playing} className="size-3.5" />
            </button>
            <Link href={`/dashboard/review?view=queue&t=${t.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate text-[15px] font-semibold text-bone">
                {t.artist} - {t.title}
              </span>
              <span className="truncate text-xs text-faint">
                {[t.genre, t.sender !== t.artist ? `via ${t.sender}` : null, t.age].filter(Boolean).join(" · ")}
              </span>
            </Link>
            <span className="shrink-0 font-mono text-xs text-faint tnum">{fmtTime(t.duration)}</span>
          </li>
        );
      })}
    </ul>
  );
}
