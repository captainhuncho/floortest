"use client";

import { usePlayer } from "@/components/Player";
import { TrackRow } from "@/components/TrackRow";
import { fmtTime } from "@/lib/format";
import { toPlayer } from "@/lib/player-track";

type Item = { id: number; title: string; artist: string; sender: string; genre: string; duration: number | null; peaks: number[] | null; played: boolean };

/** The newest tracks still waiting for a decision, playable in place (the shared TrackRow). */
export function UpNext({ items }: { items: Item[] }) {
  const { current, playing, play } = usePlayer();
  const queue = items.map(toPlayer);
  return (
    <ul className="space-y-2">
      {items.map((t) => (
        <TrackRow
          key={t.id}
          title={t.title}
          artist={t.artist}
          genre={t.genre}
          sub={t.sender !== t.artist ? [t.artist, t.genre, `via ${t.sender}`].filter(Boolean).join(" · ") : undefined}
          href={`/dashboard/review?view=queue&t=${t.id}`}
          onPlay={() => play(toPlayer(t), queue)}
          playing={current?.id === t.id && playing}
          columns={[{ key: "length", label: "Length", value: fmtTime(t.duration) }]}
        />
      ))}
    </ul>
  );
}
