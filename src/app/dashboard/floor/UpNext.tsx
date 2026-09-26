"use client";

import Link from "next/link";
import { PlayIcon, usePlayer } from "@/components/Player";
import { fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";

type Item = { id: number; title: string; artist: string; sender: string; genre: string; duration: number | null; peaks: number[] | null; played: boolean };

/** The oldest tracks still waiting for a decision, playable in place. */
export function UpNext({ items }: { items: Item[] }) {
  const { current, playing, play } = usePlayer();
  const queue = items.map(toPlayer);
  return (
    <ul className="divide-y divide-line">
      {items.map((t) => {
        const on = current?.id === t.id;
        return (
          <li key={t.id} className="flex items-center gap-3 py-3">
            <button
              onClick={() => play(toPlayer(t), queue)}
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border transition ${on ? "border-lime bg-lime text-ink" : "border-line hover:border-mute"}`}
              aria-label={on && playing ? `Pause ${t.title}` : `Play ${t.title}`}
            >
              <PlayIcon playing={on && playing} className="h-3.5 w-3.5" />
            </button>
            <Link href={`/dashboard?view=queue&t=${t.id}`} className="min-w-0 flex-1 hover:text-lime">
              <p className="truncate font-medium">
                {t.artist} - {t.title}
              </p>
              <p className="truncate text-sm text-mute">
                {[t.genre, t.sender !== t.artist ? `via ${t.sender}` : null].filter(Boolean).join(" · ")}
              </p>
            </Link>
            <span className="text-sm text-mute tnum">{fmtTime(t.duration)}</span>
          </li>
        );
      })}
    </ul>
  );
}
