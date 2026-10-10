"use client";

import { useFocusTrap } from "@/components/useFocusTrap";
import Link from "next/link";
import { useEffect, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { createCollection, deleteCollection, setActiveCollection, updateCollection } from "../actions/collections";
import { DownloadActions } from "../DownloadActions";
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
  /** Pro/Team: "Stop at N tracks" for this callout (null = no cap). */
  maxTracks: number | null;
  /** The plan allows capping callouts. */
  canCap: boolean;
  /** Reached its track cap (shown as "Full" rather than "Closed"). */
  full: boolean;
  /** URL of the collection's artwork, if it has one. */
  art: string | null;
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
            {closed && <span className="chip ml-1 border-line text-mute">{c.full ? "Full" : "Closed"}</span>}
          </h2>
          <p className="mt-1 text-sm text-mute">
            <Link href={`/dashboard/collections/${c.id}`} className="hover:text-bone">
              <b className="text-lime tnum">{c.needsReview}</b> need review · <b className="text-bone tnum">{c.kept}</b> kept · <b className="text-bone tnum">{c.count}</b> total · Open folder →
            </Link>
            {c.closesLabel && ` · ${closed ? "closed" : "closes"} ${c.closesLabel}`}
          </p>
          {(c.genres.length > 0 || c.briefWanted || c.bpmMin || c.briefNote) && (
            <div className="mt-3 border-l-2 border-lime/60 pl-3">
              <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-bone underline decoration-lime/60 underline-offset-4">Brief</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                {c.bpmMin && c.bpmMax ? (
                  <>
                    <dt className="font-bold uppercase tracking-[0.5px] text-bone">BPM</dt>
                    <dd className="text-mute tnum">
                      {c.bpmMin}–{c.bpmMax}
                    </dd>
                  </>
                ) : null}
                {c.genres.length > 0 && (
                  <>
                    <dt className="font-bold uppercase tracking-[0.5px] text-bone">Genres</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {c.genres.map((g) => (
                        <span key={g} className="rounded-full border border-line px-2 py-0.5 text-xs text-mute">
                          {g}
                        </span>
                      ))}
                    </dd>
                  </>
                )}
                {c.briefWanted && (
                  <>
                    <dt className="font-bold uppercase tracking-[0.5px] text-bone">Wanted</dt>
                    <dd className="text-mute">{c.briefWanted}</dd>
                  </>
                )}
                {c.briefNote && (
                  <>
                    <dt className="font-bold uppercase tracking-[0.5px] text-bone">Note</dt>
                    <dd className="italic text-mute">“{c.briefNote}”</dd>
                  </>
                )}
              </dl>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/collections/${c.id}`} className="btn-ghost btn-sm">
            Open collection
          </Link>
          <DownloadActions collectionId={c.id} crateName={c.name} count={c.count} size="sm" />
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
          <label className="block space-y-1.5 sm:col-span-3">
            <span className="label">Name</span>
            <input name="name" defaultValue={c.name} className="input" maxLength={60} required />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Closes after (optional)</span>
            <input name="closes" type="date" defaultValue={toDateInput(c.closesAt)} className="input [color-scheme:dark]" />
          </label>
          {c.canCap && (
            <label className="block space-y-1.5">
              <span className="label">Stop at (optional)</span>
              <span className="flex items-center gap-2">
                <input name="max_tracks" type="number" inputMode="numeric" min={1} max={100000} defaultValue={c.maxTracks ?? ""} placeholder="No limit" className="input w-32" />
                <span className="text-sm text-mute">tracks</span>
              </span>
            </label>
          )}
          <div className="flex gap-2">
            <button className="btn-lime" disabled={pending}>
              Save
            </button>
          </div>
          <p className="text-sm text-mute sm:col-span-3">
            After the closing date your link shows “callout closed” and stops taking uploads. Clear the date to reopen.
            {c.canCap && " With a track limit, it shows “callout full” once that many have arrived. Raise or clear the limit to reopen."}
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
      {editing && <ArtUpload id={c.id} name={c.name} art={c.art} />}
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
        {c.art && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.art} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        {!c.art && rows.map((bars, r) => (
          <span key={r} aria-hidden className={`flex items-center gap-0.5 ${r ? "h-5" : "h-7"}`}>
            {bars.map((h, i) => (
              <span key={i} className={`w-0.5 rounded-[1px] ${i < (r ? 8 : 12) ? "bg-white" : "bg-faint"}`} style={{ height: `${Math.round(h * 100)}%`, opacity: i < (r ? 8 : 12) ? 0.5 + h / 2 : 0.2 }} />
            ))}
          </span>
        ))}
        {receiving && !closed && (
          <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-md border border-white bg-black/60 px-2 py-1 text-[11px] font-bold tracking-[0.5px] text-white">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icons/receiving-dot.svg" alt="" className="size-[5px]" />
            RECEIVING
          </span>
        )}
        {closed && <span className="absolute left-2.5 top-2.5 rounded-md border border-faint bg-black/60 px-2 py-1 text-[11px] font-bold tracking-[0.5px] text-mute">{c.full ? "FULL" : "CLOSED"}</span>}
      </Link>
      <Link href={`/dashboard/review?view=queue&c=${c.id}`} aria-label={`Play ${c.name} in the queue`} className="absolute right-2.5 grid size-[30px] place-items-center rounded-lg bg-ink opacity-90" style={{ top: "calc(100% - 56px - 40px)" }}>
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
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 pb-8 backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div
        ref={box}
        tabIndex={-1}
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
          Open collection
        </Link>
      )}
      {c.needsReview > 0 && (
        <Link role="menuitem" href={`/dashboard/review?view=queue&c=${c.id}`}>
          Review {c.needsReview} new
        </Link>
      )}
      <button role="menuitem" onClick={() => { onClose(); onEdit(); }}>
        Edit collection
      </button>
      <div>
        <DownloadActions collectionId={c.id} crateName={c.name} count={c.count} size="sm" />
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
          {c.art && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.art} alt="" className="size-9 shrink-0 rounded-md object-cover" />
          )}
          <h1 className="min-w-0 truncate text-[20px] font-bold">{c.name}</h1>
        </div>
        <button onClick={() => setMenu(true)} aria-haspopup="menu" aria-label={`Options for ${c.name}`} className="grid size-9 shrink-0 place-items-center text-lg font-bold leading-none">
          •••
        </button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {receiving && !closed ? (
          <span className="flex items-center gap-1 rounded-md border border-bone bg-bone/10 px-2 py-1 text-[11px] font-bold tracking-[0.5px] text-bone">
            <span aria-hidden className="size-[5px] rounded-full bg-bone" />
            RECEIVING
          </span>
        ) : (
          <span className="text-[11px] font-bold tracking-[0.5px] text-faint">{closed ? (c.full ? "FULL" : "CLOSED") : "NOT RECEIVING"}</span>
        )}
        {!editing && (
          <button onClick={() => setEditing(true)} className="rounded-md border border-line bg-ink-3 px-3 py-1.5 text-[11px] font-bold text-bone">
            Edit collection
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
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box, open);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button onClick={() => setOpen(true)} className="rounded-md border border-line bg-ink-3 px-3 py-1.5 text-[11px] font-bold text-bone hover:border-mute">
        Edit collection
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-20 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Edit ${c.name}`} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-xl">
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

/** The collection's artwork: shown on its tile and, while it's receiving, on the public link page. */
function ArtUpload({ id, name, art }: { id: number; name: string; art: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function send(method: "POST" | "DELETE", file?: File) {
    setBusy(true);
    setError(null);
    const body = file ? new FormData() : undefined;
    if (file) body!.set("file", file);
    const res = await fetch(`/api/collection-art/${id}`, { method, body });
    setBusy(false);
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error || "That didn't work. Try again.");
    else router.refresh();
  }
  return (
    <div className="mt-5 flex items-center gap-4 border-t border-line pt-5">
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-ink">
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt={`Artwork for ${name}`} className="size-full object-cover" />
        ) : (
          <span className="px-2 text-center text-[11px] text-mute">No artwork</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="label">Artwork (optional)</p>
        <p className="mt-1 text-sm text-mute">Square works best. JPG, PNG or WebP, up to 8 MB. Shown on your link while this collection is receiving.</p>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Choose artwork for ${name}`} tabIndex={-1} className="sr-only" onChange={(e) => e.target.files?.[0] && send("POST", e.target.files[0])} />
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className="btn-ghost btn-sm min-h-11">
            {busy ? "Working…" : art ? "Replace" : "Upload"}
          </button>
          {art && (
            <button type="button" disabled={busy} onClick={() => send("DELETE")} className="btn btn-sm min-h-11 text-mute hover:text-bone">
              Remove
            </button>
          )}
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * The danger zone on a collection: deleting needs the name typed in capitals. Its tracks aren't deleted; they go back
 * to the Review Queue, unsorted. The last collection can't go, because the link always needs somewhere to send tracks.
 */
export function DeleteCollection({ c, canDelete }: { c: { id: number; name: string }; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, start] = useTransition();
  const want = c.name.trim().toUpperCase();
  const match = typed.trim() === want;
  return (
    <section aria-labelledby={`del-${c.id}`} className="rounded-lg border border-danger/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id={`del-${c.id}`} className="text-sm font-bold">Delete this collection</h3>
          <p className="text-xs text-mute">{canDelete ? "Its tracks stay in your Review Queue, unsorted. This can't be undone." : "You need at least one collection, so this one can't be deleted. Make another first."}</p>
        </div>
        {canDelete && !open && (
          <button type="button" onClick={() => setOpen(true)} className="btn-danger btn-sm">
            Delete…
          </button>
        )}
      </div>
      {canDelete && open && (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (match) start(() => deleteCollection(c.id, typed));
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-xs text-mute">
              Type <span className="font-mono font-bold text-bone">{want}</span> to confirm
            </span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" spellCheck={false} className="input font-mono" aria-invalid={typed !== "" && !match} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button disabled={!match || pending} className="btn btn-sm bg-danger font-bold text-ink disabled:cursor-not-allowed disabled:opacity-40">
              {pending ? "Deleting…" : "Delete collection"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setTyped(""); }} className="btn-ghost btn-sm">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
