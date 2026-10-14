"use client";

import { useFocusTrap } from "@/components/useFocusTrap";
import Link from "next/link";
import { useEffect, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { createCollection, deleteCollection, setActiveCollection, updateCollection } from "../actions/collections";
import { DownloadActions } from "../DownloadActions";
import { GenresField } from "./GenresField";
import type { BriefItem } from "@/lib/brief";
import { TrackTag } from "@/components/TrackRow";

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
  /** The brief as shown everywhere (src/lib/brief.ts). */
  brief: BriefItem[];
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

export function CollectionCard({ c, receiving, closed, canManage = true, startEditing = false }: { c: C; receiving: boolean; closed: boolean; canManage?: boolean; startEditing?: boolean }) {
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
          {/* The deadline is already in the line above, so the card's brief leaves it out. */}
          {c.brief.some((b) => b.key !== "deadline") && (
            <div className="mt-3 border-l-2 border-lime/60 pl-3">
              <p className="text-[11px] font-bold uppercase tracking-[1.5px] text-bone underline decoration-lime/60 underline-offset-4">Brief</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                {c.brief
                  .filter((b) => b.key !== "deadline")
                  .map((b) => (
                    <div key={b.key} className="contents">
                      <dt className="font-bold uppercase tracking-[0.5px] text-bone">{b.label}</dt>
                      {b.chips ? (
                        <dd className="flex flex-wrap gap-1.5">
                          {b.chips.map((g) => (
                            <span key={g} className="rounded-full border border-line px-2 py-0.5 text-xs text-mute">
                              {g}
                            </span>
                          ))}
                        </dd>
                      ) : (
                        <dd className={`text-mute ${b.key === "note" ? "italic" : "tnum"}`}>{b.text}</dd>
                      )}
                    </div>
                  ))}
              </dl>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/collections/${c.id}`} className="btn-ghost btn-sm">
            Open collection
          </Link>
          <DownloadActions collectionId={c.id} crateName={c.name} count={c.count} size="sm" />
          {!receiving && canManage && (
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
                <span className="block text-sm font-medium">Let me share tracks privately</span>
                <span className="block text-xs text-mute">
                  Senders see this in your brief and agree to it when they send. Only tracks sent while it&apos;s on can be shared, through share links to people you name.
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

/** "New collection": a ghost button (the page header, or the link strip when nothing is open); the form opens under it. */
export function NewCollection() {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  if (!open)
    return (
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>
        <span aria-hidden className="size-3 bg-current [mask:url(/icons/plus.svg)_center/contain_no-repeat]" />
        New collection
      </button>
    );
  return (
    <form
      className="flex w-full basis-full flex-wrap items-end gap-3 card p-4"
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

/** Three dots, drawn: the row menu's trigger. */
function MoreIcon() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="currentColor">
      <circle cx="5" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="19" cy="12" r="1.6" />
    </svg>
  );
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * One collection in the crate list: a status dot, the name (with a neutral Receiving / Closed / Full tag), then one
 * tabular readout line. The dot is the list's one light: lime only on the collection the link sends to, a quiet mute
 * dot on other open callouts, an empty ring once closed or full. The row opens the collection; ··· holds the rest
 * (send new tracks here, review, edit, download). Two lines on phones, every target 44px.
 */
export function CollectionRow({ c, receiving, closed, canManage = true }: { c: C; receiving: boolean; closed: boolean; /** Owner or A&R / Admin: may change where the link sends tracks. */ canManage?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const live = receiving && !closed;
  const readout = [
    c.maxTracks ? `${c.count} of ${plural(c.maxTracks, "track")}` : plural(c.count, "track"),
    c.needsReview > 0 ? `${c.needsReview} new` : null,
    c.kept > 0 ? `${c.kept} kept` : null,
    c.closesLabel ? `${closed && !c.full ? "closed" : "closes"} ${c.closesLabel}` : null,
  ].filter(Boolean);
  return (
    <li className="flex flex-col">
      <div className="flex min-h-16 items-center gap-3 pl-3 pr-1 transition-colors duration-150 ease-out hover:bg-ink-2 sm:min-h-14">
        <span aria-hidden className={`size-2 shrink-0 rounded-full ${live ? "live-dot" : closed ? "border border-faint" : "bg-mute"}`} />
        <Link href={`/dashboard/collections/${c.id}`} className="flex min-w-0 flex-1 flex-col gap-1 self-stretch justify-center py-2.5">
          <span className="flex min-w-0 items-center gap-2">
            <span className={`truncate text-body font-bold ${closed ? "text-mute" : "text-bone"}`}>{c.name}</span>
            {live && <TrackTag>Receiving</TrackTag>}
            {closed && <TrackTag>{c.full ? "Full" : "Closed"}</TrackTag>}
          </span>
          <span className="truncate text-xs text-faint tnum">{readout.join(" · ")}</span>
        </Link>
        <button
          onClick={() => setMenu(true)}
          aria-haspopup="menu"
          aria-label={`More for ${c.name}`}
          className="grid size-11 shrink-0 place-items-center rounded-lg text-mute transition-colors duration-150 hover:bg-ink-3 hover:text-bone"
        >
          <MoreIcon />
        </button>
      </div>
      {editing && (
        <div className="pb-4">
          <CollectionCard c={c} receiving={receiving} closed={closed} canManage={canManage} startEditing />
          <button className="mt-2 text-sm text-mute hover:text-bone tap-text" onClick={() => setEditing(false)}>
            Close
          </button>
        </div>
      )}
      {menu && <CollectionOptions c={c} receiving={receiving} canManage={canManage} onEdit={() => setEditing(true)} onClose={() => setMenu(false)} showOpen />}
    </li>
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
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-line bg-ink-2 text-[13px] text-bone shadow-pop"
      >
        <p className="truncate border-b border-line px-4 py-3 eyebrow">{title}</p>
        <div className="flex flex-col divide-y divide-line [&>*]:block [&>*]:w-full [&>*]:px-4 [&>*]:py-3.5 [&>*]:text-left">{children}</div>
      </div>
    </div>
  );
}

/** The shared options for one collection. */
function CollectionOptions({ c, receiving, canManage, onEdit, onClose, showOpen }: { c: C; receiving: boolean; canManage: boolean; onEdit: () => void; onClose: () => void; showOpen: boolean }) {
  const [pending, start] = useTransition();
  return (
    <OptionsSheet title={c.name} onClose={onClose}>
      {!receiving && canManage && (
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
export function CollectionDetailHeader({ c, receiving, closed, canManage = true }: { c: C; receiving: boolean; closed: boolean; /** Owner or A&R / Admin: may change where the link sends tracks. */ canManage?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <>
      <div className="flex h-12 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Link href="/dashboard/collections" aria-label="Back to Collections" className="-ml-1.5 grid size-11 shrink-0 place-items-center">
            <span aria-hidden className="size-4 bg-current [mask:url(/icons/arrow-left.svg)_center/contain_no-repeat]" />
          </Link>
          {c.art && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.art} alt="" className="size-9 shrink-0 rounded-md object-cover" />
          )}
          <h1 className="page-title min-w-0 truncate">{c.name}</h1>
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
          <CollectionCard c={c} receiving={receiving} closed={closed} canManage={canManage} startEditing />
          <button className="mt-2 text-sm text-mute hover:text-bone tap-text" onClick={() => setEditing(false)}>
            Close
          </button>
        </div>
      )}
      {menu && <CollectionOptions c={c} receiving={receiving} canManage={canManage} onEdit={() => setEditing(true)} onClose={() => setMenu(false)} showOpen={false} />}
    </>
  );
}

/** Desktop "Edit Collection": the edit form in a pop-up over the page. Tap outside or ✕ to close. */
export function EditCollectionInfo({ c, receiving, closed, canManage = true }: { c: C; receiving: boolean; closed: boolean; /** Owner or A&R / Admin: may change where the link sends tracks. */ canManage?: boolean }) {
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
            <CollectionCard c={c} receiving={receiving} closed={closed} canManage={canManage} startEditing />
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
          <p className="text-xs text-mute">{canDelete ? "Its tracks stay in your Queue, unsorted. This can't be undone." : "You need at least one collection, so this one can't be deleted. Make another first."}</p>
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
