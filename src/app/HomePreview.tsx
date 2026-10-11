"use client";

import { useState } from "react";

/** A small, self-contained demo of the desk for the home page. No real data, no audio. */
const COLLECTIONS = [
  { name: "Afterlife", count: 12 },
  { name: "Villagers", count: 8 },
  { name: "Keepers", count: 5 },
];

const TRACKS = [
  { title: "Night Bloom", artist: "Amankwa", bpm: 124, art: "from-[#6b4bff] to-[#ff5a5a]", status: "New", signals: 1 },
  { title: "Soft Landing", artist: "Niella", bpm: 120, art: "from-[#2f5bff] to-[#6ff0c8]", status: "Listened", signals: 2 },
  { title: "Dust & Honey", artist: "Mensa", bpm: 128, art: "from-[#b8862a] to-[#d9a441]", status: "Downloaded", signals: 3 },
];

const RECEIPT = ["Delivered", "Listened", "Downloaded", "Replied"];

// Deterministic "waveform" so server and client render the same bars.
const bars = (seed: number) =>
  Array.from({ length: 64 }, (_, i) => 0.35 + 0.65 * Math.abs(Math.sin((i + 1) * (seed + 1.7)) * Math.cos(i * 0.37 + seed)));

export function HomePreview({ host }: { host: string }) {
  const [col, setCol] = useState(0);
  const [sel, setSel] = useState(0);
  const t = TRACKS[sel];

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-ink-2 shadow-2xl shadow-black/60">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-5 py-4 sm:px-7">
        <p className="inline-flex items-center gap-2 text-lg font-bold tracking-tight">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/crest.svg" alt="" aria-hidden className="size-7 shrink-0" />
          FloorTest
        </p>
        <div className="flex items-center gap-1 overflow-x-auto">
          <span className="home-label mr-2 hidden sm:inline">Collections</span>
          {COLLECTIONS.map((c, i) => (
            <button
              key={c.name}
              type="button"
              onClick={() => setCol(i)}
              className={`shrink-0 rounded-md px-3.5 py-1.5 text-xs ${
                col === i ? "border border-white/15 bg-white/10 text-bone" : "text-mute hover:text-bone"
              }`}
            >
              {c.name} <span className="ml-1 opacity-60">{c.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 py-5 sm:px-7">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="home-label">Receiving collection</p>
            <p className="mt-1 text-2xl font-bold uppercase tracking-tight sm:text-3xl">{COLLECTIONS[col].name}</p>
          </div>
          <p className="flex items-center gap-2 text-xs uppercase text-lime">
            <span className="h-1.5 w-1.5 rounded-md bg-lime" /> {COLLECTIONS[col].count} tracks · receiving now
          </p>
        </div>

        <ul className="mt-4 divide-y divide-white/10 border-y border-white/10">
          {TRACKS.map((r, i) => (
            <li key={r.title}>
              <button
                type="button"
                onClick={() => setSel(i)}
                aria-pressed={sel === i}
                className={`flex w-full items-center gap-4 py-3.5 pl-3 pr-2 text-left transition ${sel === i ? "border-l-2 border-lime bg-white/[0.03]" : "border-l-2 border-transparent hover:bg-white/[0.02]"}`}
              >
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-md bg-gradient-to-br ${r.art} text-[11px] font-medium text-white`}>
                  <span className="rounded bg-ink/70 px-1">PLAY</span>
                </span>
                <span className="w-36 shrink-0 sm:w-44">
                  <span className="block truncate font-semibold">{r.title}</span>
                  <span className="block truncate text-[11px] text-dim">
                    {r.artist} · {r.bpm} BPM
                  </span>
                </span>
                <span aria-hidden className="hidden h-8 flex-1 items-center gap-[3px] md:flex">
                  {bars(i).map((h, j) => (
                    <span key={j} className={`w-full rounded-sm ${sel === i ? "bg-lime/70" : "bg-white/25"}`} style={{ height: `${Math.round(h * 100)}%` }} />
                  ))}
                </span>
                <span className="ml-auto w-24 shrink-0 text-right text-[11px] uppercase text-dim">{r.status}</span>
              </button>
            </li>
          ))}
        </ul>

        <div className="mt-5 border-t border-white/10 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="home-label text-lime">Selected track</p>
              <p className="mt-1 text-xl font-semibold">{t.title}</p>
              <p className="text-xs text-dim">
                {t.artist} · {t.bpm} BPM
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {["Keep", "Not for me", "Download", "Reply"].map((b) => (
                <span key={b} className="rounded-md border border-white/15 px-3 py-2 text-[11px] uppercase text-bone">
                  {b}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-5 flex items-center justify-between border-t border-white/10 pt-4">
            <p className="home-label">Sender receipt</p>
            <p className="home-label">
              {t.signals} of {RECEIPT.length} signals
            </p>
          </div>
          <ol className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {RECEIPT.map((s, i) => (
              <li key={s}>
                <span className={`block h-1 rounded-sm ${i < t.signals ? "bg-lime" : "bg-white/10"}`} />
                <span className={`mt-2 block text-[11px] uppercase ${i < t.signals ? "text-bone" : "text-dim"}`}>{s}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-3 text-xs">
          <span className="text-mute">Your link · {host}/maxwell</span>
          <span className="uppercase text-lime">Routing to {COLLECTIONS[col].name}</span>
        </div>
      </div>
    </div>
  );
}
