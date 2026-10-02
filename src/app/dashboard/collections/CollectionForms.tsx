"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
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
  allowSharing: boolean;
  /** The site-wide sharing switch (Admin → Feature switches); the option only shows when it is on. */
  sharingAvailable: boolean;
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
            {c.sharingAvailable && (
            <label className="flex items-start gap-3 sm:col-span-2">
              <input type="checkbox" name="allow_sharing" defaultChecked={c.allowSharing} className="mt-1 h-4 w-4 accent-lime" />
              <span>
                <span className="block text-sm font-medium">Let me share tracks with colleagues</span>
                <span className="block text-xs text-mute">
                  Senders see this in your brief. Only tracks sent while it&apos;s on can be shared, through a private listen-only link.
                </span>
              </span>
            </label>
            )}
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
        className="flex aspect-[171/221] w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-line bg-ink"
      >
        <span className="grid size-9 place-items-center rounded-full bg-ink-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/plus.svg" alt="" className="size-3.5" />
        </span>
        <span className="text-[11px] font-bold text-mute">New collection</span>
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
    <div className="relative overflow-hidden rounded-2xl border border-line bg-ink-3">
      <Link href={`/dashboard/collections/${c.id}`} className="relative flex aspect-square flex-col justify-end gap-1.5 bg-gradient-to-b from-[#1a2a0a] to-ink p-4" aria-label={`Open ${c.name}`}>
        {rows.map((bars, r) => (
          <span key={r} aria-hidden className={`flex items-center gap-0.5 ${r ? "h-5" : "h-7"}`}>
            {bars.map((h, i) => (
              <span key={i} className={`w-0.5 rounded-[1px] ${i < (r ? 8 : 12) ? "bg-white" : "bg-faint"}`} style={{ height: `${Math.round(h * 100)}%`, opacity: i < (r ? 8 : 12) ? 0.5 + h / 2 : 0.2 }} />
            ))}
          </span>
        ))}
        {receiving && !closed && (
          <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md border border-white bg-white/[0.08] px-2 py-1 text-[11px] font-bold tracking-[0.5px] text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/receiving-dot.svg" alt="" className="size-[5px]" />
            RECEIVING
          </span>
        )}
        {closed && <span className="absolute left-2.5 top-2.5 rounded-md border border-faint px-2 py-1 text-[11px] font-bold tracking-[0.5px] text-mute">CLOSED</span>}
      </Link>
      <Link href={`/dashboard?view=queue&c=${c.id}`} aria-label={`Play ${c.name} in the queue`} className="absolute right-2.5 grid size-[30px] place-items-center rounded-lg bg-ink opacity-90" style={{ top: "calc(100% - 56px - 40px)" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/tile-play.svg" alt="" className="size-3" />
      </Link>
      <div className="flex flex-col gap-[3px] px-2.5 pb-3 pt-2.5">
        <Link href={`/dashboard/collections/${c.id}`} className="truncate text-[13px] font-bold text-bone">
          {c.name}
        </Link>
        <div className="flex items-center justify-between text-mute">
          <span className="text-[11px]">
            {c.count} track{c.count === 1 ? "" : "s"}
            {c.needsReview > 0 && ` · ${c.needsReview} new`}
          </span>
          <button onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-label={`More for ${c.name}`} className="px-1 text-sm leading-none">
            ···
          </button>
        </div>
      </div>
      {menu && <CollectionOptions c={c} receiving={receiving} onEdit={() => setEditing(true)} onClose={() => setMenu(false)} showOpen />}
    </div>
  );
}

/** Options over the whole screen; tapping anywhere outside the card closes it. */
function OptionsSheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 pb-8 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div
        role="menu"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-ink-2 text-[13px] text-bone shadow-2xl shadow-black/60"
      >
        <p className="truncate border-b border-line px-4 py-3 text-[11px] font-bold uppercase tracking-[1px] text-mute">{title}</p>
        <div className="flex flex-col divide-y divide-line [&>*]:block [&>*]:w-full [&>*]:px-4 [&>*]:py-3.5 [&>*]:text-left">{children}</div>
      </div>
    </div>
  );
}

/** The shared options for one collection. */
function CollectionOptions({ c, receiving, onEdit, onClose, showOpen }: { c: C; receiving: boolean; onEdit: () => void; onClose: () => void; showOpen: boolean }) {
  const [pending, start] = useTransition();
  return (
    <OptionsSheet title={c.name} onClose={onClose}>
      {!receiving && (
        <button role="menuitem" disabled={pending} onClick={() => start(async () => { await setActiveCollection(c.id); onClose(); })}>
          Send new tracks here
        </button>
      )}
      {showOpen && (
        <Link role="menuitem" href={`/dashboard/collections/${c.id}`}>
          Open folder
        </Link>
      )}
      {c.needsReview > 0 && (
        <Link role="menuitem" href={`/dashboard?view=queue&c=${c.id}`}>
          Review {c.needsReview} new
        </Link>
      )}
      <button role="menuitem" onClick={() => { onClose(); onEdit(); }}>
        Edit info
      </button>
      <div>
        <ExportButton collectionId={c.id} count={c.count} whole label="Download collection" variant="ghost" />
      </div>
      <button role="menuitem" className="text-center! text-mute" onClick={onClose}>
        Cancel
      </button>
    </OptionsSheet>
  );
}

/** Figma "04 Collection Detail" header: back, name, ••• options, receiving badge and Edit Info. */
export function CollectionDetailHeader({ c, receiving, closed, canDelete }: { c: C; receiving: boolean; closed: boolean; canDelete: boolean }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div className="flex h-12 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/dashboard/collections" aria-label="Back to Collections" className="grid size-8 place-items-center">
            <span aria-hidden className="size-4 bg-current [mask:url(/icons/arrow-left.svg)_center/contain_no-repeat]" />
          </Link>
          <h1 className="min-w-0 truncate text-[20px] font-bold">{c.name}</h1>
        </div>
        <button onClick={() => setMenu(true)} aria-haspopup="menu" aria-label={`Options for ${c.name}`} className="grid size-9 shrink-0 place-items-center text-lg font-bold leading-none">
          •••
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {receiving && !closed ? (
          <span className="flex items-center gap-1 rounded-md border border-white bg-white/10 px-2 py-1 text-[11px] font-bold tracking-[0.5px] text-white">
            <span aria-hidden className="size-[5px] rounded-full bg-white" />
            RECEIVING
          </span>
        ) : (
          <span className="text-[11px] font-bold tracking-[0.5px] text-faint">{closed ? "CLOSED" : "NOT RECEIVING"}</span>
        )}
        {!editing && (
          <button onClick={() => setEditing(true)} className="rounded-md border border-line bg-ink-3 px-3 py-1.5 text-[11px] font-bold text-bone">
            Edit Info
          </button>
        )}
      </div>
      {editing && (
        <div className="w-full">
          <CollectionCard c={c} receiving={receiving} closed={closed} canDelete={canDelete} startEditing />
          <button className="mt-2 text-sm text-mute hover:text-bone" onClick={() => setEditing(false)}>
            Close
          </button>
        </div>
      )}
      {menu && <CollectionOptions c={c} receiving={receiving} onEdit={() => setEditing(true)} onClose={() => setMenu(false)} showOpen={false} />}
    </>
  );
}

/** Desktop "Edit Collection": the edit form in a pop-up over the page. Tap outside or ✕ to close. */
export function EditCollectionInfo({ c, receiving, closed, canDelete }: { c: C; receiving: boolean; closed: boolean; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-md border border-line bg-ink-3 px-3 py-1.5 text-[11px] font-bold text-bone hover:border-mute">
        Edit Collection
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-20 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <div role="dialog" aria-label={`Edit ${c.name}`} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-xl">
            <button onClick={() => setOpen(false)} aria-label="Close" className="absolute right-3 top-3 z-10 grid size-8 place-items-center rounded-full text-lg text-mute hover:bg-ink-3 hover:text-bone">
              ✕
            </button>
            <CollectionCard c={c} receiving={receiving} closed={closed} canDelete={canDelete} startEditing />
          </div>
        </div>
      )}
    </>
  );
}
