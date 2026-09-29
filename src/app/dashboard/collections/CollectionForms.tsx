"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { createCollection, deleteCollection, setActiveCollection, updateCollection } from "../actions";
import { ExportButton } from "../ExportButton";
import { GenresField } from "./GenresField";

type C = {
  id: number;
  name: string;
  closesAt: number | null;
  closesLabel: string | null;
  count: number;
  needsReview: number;
  kept: number;
  briefWanted: string;
  bpmMin: number | null;
  bpmMax: number | null;
  briefNote: string;
  genres: string[];
};

const toDateInput = (ts: number | null) => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function CollectionCard({ c, receiving, closed, canDelete, startEditing = false }: { c: C; receiving: boolean; closed: boolean; canDelete: boolean; startEditing?: boolean }) {
  const [editing, setEditing] = useState(startEditing);
  const [pending, start] = useTransition();

  return (
    <div className={`card p-5 ${receiving ? "border-lime/50" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold">
            <Link href={`/dashboard/collections/${c.id}`} className="hover:underline">
              {c.name}
            </Link>{" "}
            {receiving && !closed && <span className="chip ml-1 border-lime/60 text-lime">Receiving</span>}
            {closed && <span className="chip ml-1 border-line text-mute">Closed</span>}
          </h2>
          <p className="mt-1 text-sm text-mute">
            <Link href={`/dashboard/collections/${c.id}`} className="hover:text-bone">
              {c.needsReview} need review · {c.kept} kept · {c.count} total · Open folder →
            </Link>
            {c.closesLabel && ` · ${closed ? "closed" : "closes"} ${c.closesLabel}`}
          </p>
          {c.genres.length > 0 && <p className="mt-1 text-sm text-mute">Genres: {c.genres.join(" · ")}</p>}
          {(c.briefWanted || c.bpmMin || c.briefNote) && (
            <p className="mt-1 text-sm text-mute">
              Brief: {[c.briefWanted, c.bpmMin && c.bpmMax ? `${c.bpmMin}–${c.bpmMax} BPM` : "", c.briefNote].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/collections/${c.id}`} className="btn-ghost btn-sm">
            Open
          </Link>
          <ExportButton collectionId={c.id} count={c.count} whole label="Download" variant="ghost" />
          {!receiving && (
            <button className="btn-ghost btn-sm" disabled={pending} onClick={() => start(() => setActiveCollection(c.id))}>
              Send new tracks here
            </button>
          )}
          <button className="btn-ghost btn-sm" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
            Edit
          </button>
        </div>
      </div>
      {editing && (
        <form
          className="mt-5 grid gap-4 border-t border-line pt-5 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          action={(fd) =>
            start(async () => {
              fd.set("tz", String(new Date().getTimezoneOffset()));
              await updateCollection(c.id, fd);
              setEditing(false);
            })
          }
        >
          <label className="block space-y-1.5">
            <span className="label">Name</span>
            <input name="name" defaultValue={c.name} className="input" maxLength={60} required />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Closes after (optional)</span>
            <input name="closes" type="date" defaultValue={toDateInput(c.closesAt)} className="input [color-scheme:dark]" />
          </label>
          <div className="flex gap-2">
            <button className="btn-lime" disabled={pending}>
              Save
            </button>
            {canDelete && (
              <button
                type="button"
                className="btn text-danger hover:bg-danger/10"
                onClick={() => {
                  if (confirm(`Delete “${c.name}”? Its tracks stay in the Review Queue, unsorted.`)) start(() => deleteCollection(c.id));
                }}
              >
                Delete
              </button>
            )}
          </div>
          <p className="text-sm text-mute sm:col-span-3">
            After the closing date your link shows “callout closed” and stops taking uploads. Clear the date to reopen.
          </p>
          <fieldset className="grid gap-4 border-t border-line pt-5 sm:col-span-3 sm:grid-cols-[1fr_auto]">
            <legend className="mb-1 font-medium">Brief for senders</legend>
            <div className="space-y-1.5 sm:col-span-2">
              <span className="label">Genres senders can choose</span>
              <GenresField initial={c.genres} />
            </div>
            <label className="block space-y-1.5">
              <span className="label">“Wanted” line on the Stage page (optional)</span>
              <input name="brief_wanted" defaultValue={c.briefWanted} maxLength={120} className="input" placeholder="Defaults to your genres" />
            </label>
            <div className="flex items-end gap-2">
              <label className="block w-24 space-y-1.5">
                <span className="label">BPM from</span>
                <input name="bpm_min" type="number" min={40} max={250} defaultValue={c.bpmMin ?? ""} className="input" />
              </label>
              <label className="block w-24 space-y-1.5">
                <span className="label">to</span>
                <input name="bpm_max" type="number" min={40} max={250} defaultValue={c.bpmMax ?? ""} className="input" />
              </label>
            </div>
            <label className="block space-y-1.5 sm:col-span-2">
              <span className="label">Vibe note</span>
              <input name="brief_note" defaultValue={c.briefNote} maxLength={200} className="input" placeholder="Percussive, warm and built for late-night rooms" />
            </label>
          </fieldset>
        </form>
      )}
    </div>
  );
}

export function NewCollection({ tile = false }: { tile?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (!open)
    return tile ? (
      // Figma "new-collection-tile"
      <button
        onClick={() => setOpen(true)}
        className="flex aspect-[171/221] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#2c2e29] bg-[#10110f] font-[family-name:var(--font-stage-mono)]"
      >
        <span className="grid size-9 place-items-center rounded-full bg-[#1e1f1b]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/plus.svg" alt="" className="size-3.5" />
        </span>
        <span className="text-[11px] font-bold text-[#a3a69b]">New collection</span>
      </button>
    ) : (
      <button className="btn-ghost" onClick={() => setOpen(true)}>
        + New collection
      </button>
    );
  return (
    <form
      className={`card flex flex-wrap items-end gap-3 p-5 ${tile ? "col-span-full" : ""}`}
      action={(fd) =>
        start(async () => {
          await createCollection(fd);
          setOpen(false);
        })
      }
    >
      <label className="block min-w-60 flex-1 space-y-1.5">
        <span className="label">Name</span>
        <input name="name" className="input" placeholder="e.g. Villagers callout" autoFocus required maxLength={60} />
      </label>
      <label className="flex items-center gap-2 py-2.5 text-sm text-mute">
        <input type="checkbox" name="activate" defaultChecked className="h-4 w-4 accent-lime" /> Send new tracks here now
      </label>
      <button className="btn-lime" disabled={pending}>
        Create
      </button>
      <button type="button" className="btn text-mute" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

// Deterministic decorative waveform for a tile, so each collection keeps its own shape.
const tileBars = (seed: number, n: number) =>
  Array.from({ length: n }, (_, i) => 0.25 + 0.75 * Math.abs(Math.sin((i + 1) * 1.7 + seed) * Math.cos(i * 0.6 + seed * 0.3)));

/** Figma "collection-tile": artwork, receiving badge, play, then name, count and a menu. */
export function CollectionTile({ c, receiving, closed, canDelete }: { c: C; receiving: boolean; closed: boolean; canDelete: boolean }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  if (editing)
    return (
      <div className="col-span-full">
        <CollectionCard c={c} receiving={receiving} closed={closed} canDelete={canDelete} startEditing />
        <button className="mt-2 text-sm text-mute hover:text-bone" onClick={() => setEditing(false)}>
          Close
        </button>
      </div>
    );
  const rows = [tileBars(c.id, 16), tileBars(c.id + 7, 16)];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#2c2e29] bg-[#1e1f1b] font-[family-name:var(--font-stage-mono)]">
      <Link href={`/dashboard/collections/${c.id}`} className="relative flex aspect-square flex-col justify-end gap-1.5 bg-gradient-to-b from-[#1a2a0a] to-[#0b0c0a] p-4" aria-label={`Open ${c.name}`}>
        {rows.map((bars, r) => (
          <span key={r} aria-hidden className={`flex items-center gap-0.5 ${r ? "h-5" : "h-7"}`}>
            {bars.map((h, i) => (
              <span key={i} className={`w-0.5 rounded-[1px] ${i < (r ? 8 : 12) ? "bg-white" : "bg-[#6b6e65]"}`} style={{ height: `${Math.round(h * 100)}%`, opacity: i < (r ? 8 : 12) ? 0.5 + h / 2 : 0.2 }} />
            ))}
          </span>
        ))}
        {receiving && !closed && (
          <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md border border-white bg-white/[0.08] px-2 py-1 text-[8px] font-bold tracking-[0.5px] text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/receiving-dot.svg" alt="" className="size-[5px]" />
            RECEIVING
          </span>
        )}
        {closed && <span className="absolute left-2.5 top-2.5 rounded-md border border-[#6b6e65] px-2 py-1 text-[8px] font-bold tracking-[0.5px] text-[#a3a69b]">CLOSED</span>}
      </Link>
      <Link href={`/dashboard?view=queue&c=${c.id}`} aria-label={`Play ${c.name} in the queue`} className="absolute right-2.5 grid size-[30px] place-items-center rounded-lg bg-[#0b0c0a] opacity-90" style={{ top: "calc(100% - 56px - 40px)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/tile-play.svg" alt="" className="size-3" />
      </Link>
      <div className="flex flex-col gap-[3px] px-2.5 pb-3 pt-2.5">
        <Link href={`/dashboard/collections/${c.id}`} className="truncate text-[13px] font-bold text-[#f1f1eb]">
          {c.name}
        </Link>
        <div className="flex items-center justify-between text-[#a3a69b]">
          <span className="text-[10px]">
            {c.count} track{c.count === 1 ? "" : "s"}
            {c.needsReview > 0 && ` · ${c.needsReview} new`}
          </span>
          <button onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-label={`More for ${c.name}`} className="px-1 text-sm leading-none">
            ···
          </button>
        </div>
      </div>
      {menu && (
        <div role="menu" className="absolute bottom-10 right-2 z-10 w-48 overflow-hidden rounded-xl border border-[#2c2e29] bg-[#1a1c18] text-xs shadow-2xl shadow-black/60">
          {!receiving && (
            <button role="menuitem" className="block w-full px-3 py-2.5 text-left hover:bg-[#2a2e24]" disabled={pending} onClick={() => start(async () => { await setActiveCollection(c.id); setMenu(false); })}>
              Send new tracks here
            </button>
          )}
          <Link role="menuitem" href={`/dashboard/collections/${c.id}`} className="block px-3 py-2.5 hover:bg-[#2a2e24]">
            Open folder
          </Link>
          <button role="menuitem" className="block w-full px-3 py-2.5 text-left hover:bg-[#2a2e24]" onClick={() => { setMenu(false); setEditing(true); }}>
            Edit info
          </button>
          <div className="px-3 py-2">
            <ExportButton collectionId={c.id} count={c.count} whole label="Download" variant="ghost" />
          </div>
        </div>
      )}
    </div>
  );
}
