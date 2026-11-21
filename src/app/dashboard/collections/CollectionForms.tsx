"use client";

import { FormError } from "@/components/Feedback";
import { useFocusTrap } from "@/components/useFocusTrap";
import Link from "next/link";
import { useEffect, useId, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { createCollection, deleteCollection, setActiveCollection, updateCollection } from "../actions/collections";
import { DownloadActions } from "../DownloadActions";
import { GenresField } from "./GenresField";
import { CARD, Chip, Icon, IconBox } from "@/components/Kit";
import { LinkRow } from "../floor/FloorClient";
import { MoveToFolder } from "./Folders";
import { CalloutState, FolderRow, MoreDots, ROUND, trackCount } from "./FolderRow";
import type { ShareCardTarget } from "./callout-card";
import { DANGER, GHOST, GHOST_TALL, LIME } from "../kitButtons";
import type { BriefItem } from "@/lib/brief";

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
  /** Its cover in the list and on its page: up to four art URLs, its own artwork first (src/lib/covers.ts). */
  covers: string[];
};

const toDateInput = (ts: number | null) => {
  if (!ts) return "";
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Small field labels, as the mocks draw them: sentence case, muted. */
const FIELD = "text-[11.5px] text-mute";

/** Where a callout stands, as a chip: lime with a dot while it's receiving, flat otherwise. */
function StateChip({ live, closed, full, closesLabel, idle }: { live: boolean; closed: boolean; full: boolean; closesLabel: string | null; idle: string }) {
  if (live)
    return (
      <Chip tone="acc">
        <span aria-hidden className="mr-0.5 size-1.5 rounded-full bg-lime" />
        Receiving
      </Chip>
    );
  return <Chip>{closed ? (full ? "Full" : `Closed${closesLabel ? ` ${closesLabel}` : ""}`) : idle}</Chip>;
}

function CollectionCard({ c, receiving, closed, startEditing = false, onDone }: { c: C; receiving: boolean; closed: boolean; startEditing?: boolean; /** Called after Save or Cancel, e.g. to close the pop-up the form sits in. */ onDone?: () => void }) {
  const [editing, setEditing] = useState(startEditing);
  const [pending, start] = useTransition();
  const formId = useId();
  // Save and Cancel both end editing: in the pop-up that closes it, so nobody has to tap Edit again to get out (owner, 16 Nov).
  const done = () => (onDone ? onDone() : setEditing(false));

  return (
    <div className={`${CARD} p-3 sm:p-4 ${receiving && !closed ? "border-lime/55" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold tracking-[-0.015em] text-bone">
            {c.name}
            {(receiving || closed) && <StateChip live={receiving && !closed} closed={closed} full={c.full} closesLabel={null} idle="" />}
          </h2>
          <p className="mt-1 text-[12px] text-mute">
            <b className="font-semibold text-lime tnum">{c.needsReview}</b> need review · <b className="font-semibold text-bone tnum">{c.kept}</b> kept · <b className="font-semibold text-bone tnum">{c.count}</b> total
            {c.closesLabel && ` · ${closed ? "closed" : "closes"} ${c.closesLabel}`}
          </p>
          {/* The deadline is already in the line above, so the card's brief leaves it out. */}
          {c.brief.some((b) => b.key !== "deadline") && (
            <div className="mt-3">
              <p className={FIELD}>Brief</p>
              <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
                {c.brief
                  .filter((b) => b.key !== "deadline")
                  .map((b) => (
                    <div key={b.key} className="contents">
                      <dt className="text-mute">{b.label}</dt>
                      {b.chips ? (
                        <dd className="flex flex-wrap gap-1">
                          {b.chips.map((g) => (
                            <Chip key={g}>{g}</Chip>
                          ))}
                        </dd>
                      ) : (
                        <dd className={b.key === "note" ? "italic text-bone" : "font-semibold text-bone tnum"}>{b.text}</dd>
                      )}
                    </div>
                  ))}
              </dl>
            </div>
          )}
        </div>
        {/* Only the form lives in this pop-up (owner, 16 Nov: one way to do each thing). Open, Download and Send new tracks
            here are on the collection's tile, its ··· menu and its page; Edit is the button that opened this. */}
      </div>
      {editing && (
        <form
          id={formId}
          className="mt-4 grid gap-3.5 border-t border-dashed border-line-2 pt-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          action={(fd) =>
            start(async () => {
              fd.set("tz", String(new Date().getTimezoneOffset()));
              await updateCollection(c.id, fd);
              done();
            })
          }
        >
          <label className="block space-y-1.5 sm:col-span-3">
            <span className={FIELD}>Name</span>
            <input name="name" defaultValue={c.name} className="input" maxLength={60} required />
          </label>
          <label className="block space-y-1.5">
            <span className={FIELD}>Closes after (optional)</span>
            {/* No colour-scheme override: the page's own (light or dark) styles the date picker. */}
            <input name="closes" type="date" defaultValue={toDateInput(c.closesAt)} className="input" />
          </label>
          {c.canCap && (
            <label className="block space-y-1.5">
              <span className={FIELD}>Stop at (optional)</span>
              <span className="flex items-center gap-2">
                <input name="max_tracks" type="number" inputMode="numeric" min={1} max={100000} defaultValue={c.maxTracks ?? ""} placeholder="No limit" className="input w-32" />
                <span className="text-[12px] text-mute">tracks</span>
              </span>
            </label>
          )}
          <p className="text-[12px] text-mute sm:col-span-3">
            After the closing date your link shows “callout closed” and stops taking uploads. Clear the date to reopen.
            {c.canCap && " With a track limit, it shows “callout full” once that many have arrived. Raise or clear the limit to reopen."}
          </p>
          <fieldset className="grid gap-3.5 border-t border-dashed border-line-2 pt-4 sm:col-span-3 sm:grid-cols-[1fr_auto]">
            <legend className="mb-1 text-[13px] font-semibold text-bone">Brief for senders</legend>
            <div className="space-y-1.5 sm:col-span-2">
              <span className={FIELD}>Genres senders can choose</span>
              <GenresField initial={c.genres} />
            </div>
            <label className="block space-y-1.5">
              <span className={FIELD}>“Wanted” line on the Stage page (optional)</span>
              <input name="brief_wanted" defaultValue={c.briefWanted} maxLength={120} className="input" placeholder="Defaults to your genres" />
            </label>
            <div className="flex items-end gap-2">
              <label className="block w-24 space-y-1.5">
                <span className={FIELD}>BPM from</span>
                <input name="bpm_min" type="number" min={40} max={250} defaultValue={c.bpmMin ?? ""} className="input" />
              </label>
              <label className="block w-24 space-y-1.5">
                <span className={FIELD}>to</span>
                <input name="bpm_max" type="number" min={40} max={250} defaultValue={c.bpmMax ?? ""} className="input" />
              </label>
            </div>
            <label className="block space-y-1.5 sm:col-span-2">
              <span className={FIELD}>Vibe note</span>
              <input name="brief_note" defaultValue={c.briefNote} maxLength={200} className="input" placeholder="Percussive, warm and built for late-night rooms" />
            </label>
            {c.sharingAvailable && (
            <label className="flex items-start gap-3 sm:col-span-2">
              <input type="checkbox" name="allow_sharing" defaultChecked={c.allowSharing} className="mt-1 h-4 w-4 accent-lime" />
              <span>
                <span className="block text-[13px] font-semibold text-bone">Let me share tracks privately</span>
                <span className="block text-[12px] text-mute">
                  Senders see this in your brief and agree to it when they send. Only tracks sent while it&apos;s on can be shared, through share links to people you name.
                </span>
              </span>
            </label>
            )}
          </fieldset>
        </form>
      )}
      {editing && <ArtUpload id={c.id} name={c.name} art={c.art} />}
      {/* Save comes last, after the brief and the artwork, so the whole form is filled in first (owner, 16 Nov). The artwork saves on its own as soon as it's chosen. */}
      {editing && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-dashed border-line-2 pt-4">
          <button type="submit" form={formId} className={LIME} disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </button>
          <button type="button" className={GHOST} onClick={done} disabled={pending}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * "New collection". As a tile it's the lime button at the top on phones and a dashed tile at the end of the grid from
 * md up (the mock); elsewhere a ghost button. The form opens in its place.
 */
export function NewCollection({ tile = false }: { tile?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const hint = useId();
  if (!open && tile)
    return (
      <>
        <button onClick={() => setOpen(true)} className={`${LIME} order-first w-full gap-1.5 md:hidden`}>
          <Icon name="plus" className="size-4" />
          New collection
        </button>
        <button
          onClick={() => setOpen(true)}
          aria-describedby={hint}
          className="hidden min-h-[150px] flex-col items-center justify-center gap-1.5 rounded-[18px] border border-dashed border-line-2 p-3 text-center transition-colors hover:bg-well md:flex"
        >
          <IconBox name="plus" small />
          <span className="text-[13px] font-semibold text-bone">New collection</span>
          <span id={hint} className="text-[11.5px] text-mute">
            One per callout
          </span>
        </button>
      </>
    );
  if (!open)
    return (
      <button className={GHOST} onClick={() => setOpen(true)}>
        <Icon name="plus" className="size-3.5" />
        New collection
      </button>
    );
  return (
    <form
      className={`flex w-full basis-full flex-wrap items-end gap-3 ${CARD} p-3 ${tile ? "order-first col-span-full md:order-none" : ""}`}
      action={(fd) =>
        start(async () => {
          await createCollection(fd);
          setOpen(false);
        })
      }
    >
      <label className="block min-w-0 flex-1 basis-60 space-y-1.5">
        <span className={FIELD}>Name</span>
        <input name="name" className="input" placeholder="e.g. Villagers callout" autoFocus required maxLength={60} />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-[12px] text-mute">
        <input type="checkbox" name="activate" defaultChecked className="h-4 w-4 accent-lime" /> Send new tracks here now
      </label>
      <button className={LIME} disabled={pending}>
        Create
      </button>
      <button type="button" className={GHOST_TALL} onClick={() => setOpen(false)}>
        Cancel
      </button>
    </form>
  );
}

/** A dashed placeholder tile in the grid (the beta limit): a small label on top, its message below. */
export function Folder({ tab, hatched = false, children }: { tab: React.ReactNode; hatched?: boolean; children: React.ReactNode }) {
  return (
    <div className={`flex min-h-[150px] flex-col gap-2 rounded-[18px] border border-dashed border-line-2 p-3 ${hatched ? "hatch" : ""}`}>
      <span className="text-[11.5px] font-semibold text-mute">{tab}</span>
      {children}
    </div>
  );
}

/**
 * One callout as a folder in the list (owner, 17 Nov: option 43): its cover, its name and one line (where it stands,
 * what it is, how many tracks). The whole row opens it; ··· has every option.
 */
export function CollectionTile({ c, receiving, closed, canManage = true, canEdit = true, link, card, folders, folderId = null }: { c: C; receiving: boolean; closed: boolean; /** Owner or A&R / Admin: may change where the link sends tracks. */ canManage?: boolean; /** May run callouts (owner, A&R / Admin, or a ticked Member): shows Edit. The server checks too. */ canEdit?: boolean; /** The desk's public link, shared from the receiving callout's ··· menu. */ link?: string; /** The callout the link's Share offers as a card. */ card?: ShareCardTarget; /** The desk's callout folders, for Move to folder (owners and admins). */ folders?: { id: number; name: string }[]; /** The folder it's filed in. */ folderId?: number | null }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [moving, setMoving] = useState(false);
  const live = receiving && !closed;
  const state = live ? "receiving" : closed ? (c.full ? "full" : "closed") : "open";
  return (
    <FolderRow
      href={`/dashboard/collections/${c.id}`}
      name={c.name}
      spoken={`Open ${c.name}, callout, ${state}, ${trackCount(c.count)}`}
      covers={c.covers}
      empty={c.count === 0 && c.covers.length === 0}
      line={
        <>
          <CalloutState live={live} closed={closed} full={c.full} closesLabel={c.closesLabel} /> · Callout · {trackCount(c.count)}
        </>
      }
      menu={
        <button onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-label={`More for ${c.name}`} className={ROUND}>
          <MoreDots />
        </button>
      }
    >
      {menu && <CollectionOptions c={c} receiving={receiving} canManage={canManage} canEdit={canEdit} link={live ? link : undefined} card={card} onEdit={() => setEditing(true)} onMove={folders && canManage ? () => setMoving(true) : undefined} onClose={() => setMenu(false)} showOpen />}
      {editing && <EditDialog c={c} receiving={receiving} closed={closed} onClose={() => setEditing(false)} />}
      {moving && folders && <MoveToFolder kind="callout" itemId={c.id} itemName={c.name} current={folderId} folders={folders} onClose={() => setMoving(false)} />}
    </FolderRow>
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 pb-[max(2rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div
        ref={box}
        tabIndex={-1}
        role="menu"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm overflow-hidden rounded-[18px] border border-line bg-card text-[13px] text-bone shadow-pop"
      >
        <p className="truncate border-b border-line px-4 py-3 text-[11.5px] font-semibold text-mute">{title}</p>
        <div className="flex flex-col divide-y divide-line [&>*]:block [&>*]:min-h-11 [&>*]:w-full [&>*]:px-4 [&>*]:py-3.5 [&>*]:text-left [&>*]:hover:bg-well">{children}</div>
      </div>
    </div>
  );
}

/** The shared options for one collection. */
function CollectionOptions({ c, receiving, canManage, canEdit, link, card, onEdit, onMove, onClose, showOpen }: { c: C; receiving: boolean; canManage: boolean; /** May run callouts: shows Edit collection. */ canEdit: boolean; /** The desk's link, while it sends tracks to this callout. */ link?: string; card?: ShareCardTarget; onEdit: () => void; /** Move to folder, where the list offers folders. */ onMove?: () => void; onClose: () => void; showOpen: boolean }) {
  const [pending, start] = useTransition();
  return (
    <OptionsSheet title={c.name} onClose={onClose}>
      {link && (
        <div>
          <p className="mb-1.5 text-[11.5px] text-mute">Share the link: it sends here</p>
          <LinkRow link={link} card={card} />
        </div>
      )}
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
      {canEdit && (
        <button role="menuitem" onClick={() => { onClose(); onEdit(); }}>
          Edit collection
        </button>
      )}
      {onMove && (
        <button role="menuitem" onClick={() => { onClose(); onMove(); }}>
          Move to folder
        </button>
      )}
      <div className="[&_a]:min-h-11 [&_button]:min-h-11 [&_span]:min-h-11">
        <DownloadActions collectionId={c.id} crateName={c.name} count={c.count} size="sm" quiet />
      </div>
      <button role="menuitem" className="text-center! text-mute" onClick={onClose}>
        Cancel
      </button>
    </OptionsSheet>
  );
}

/** The tools on a callout's page: its link while it's receiving, and ··· with every option. */
export function CalloutTools({ c, receiving, closed, canManage = true, canEdit = true, link, card }: { c: C; receiving: boolean; closed: boolean; /** Owner or A&R / Admin: may change where the link sends tracks. */ canManage?: boolean; /** May run callouts (owner, A&R / Admin, or a ticked Member): shows Edit. The server checks too. */ canEdit?: boolean; /** The desk's public link, while it sends tracks here. */ link?: string; card?: ShareCardTarget }) {
  const [menu, setMenu] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <>
      {link && (
        <button onClick={() => setSharing(true)} aria-haspopup="dialog" aria-label="Share the link" className={ROUND}>
          <Icon name="link" className="size-[18px]" />
        </button>
      )}
      <button onClick={() => setMenu(true)} aria-haspopup="menu" aria-label={`Options for ${c.name}`} className={ROUND}>
        <MoreDots />
      </button>
      {sharing && link && (
        <OptionsSheet title="Your link sends here" onClose={() => setSharing(false)}>
          <div>
            <LinkRow link={link} card={card} />
          </div>
          <button className="text-center! text-mute" onClick={() => setSharing(false)}>
            Close
          </button>
        </OptionsSheet>
      )}
      {menu && <CollectionOptions c={c} receiving={receiving} canManage={canManage} canEdit={canEdit} link={link} card={card} onEdit={() => setEditing(true)} onClose={() => setMenu(false)} showOpen={false} />}
      {editing && <EditDialog c={c} receiving={receiving} closed={closed} onClose={() => setEditing(false)} />}
    </>
  );
}

/** The edit form in a pop-up over the page. Tap outside, Escape or ✕ to close. */
function EditDialog({ c, receiving, closed, onClose }: { c: C; receiving: boolean; closed: boolean; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/60 p-4 pt-16 backdrop-blur-[2px] sm:pt-20" onClick={onClose}>
      <div ref={box} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Edit ${c.name}`} onClick={(e) => e.stopPropagation()} className="relative w-full max-w-xl pb-[env(safe-area-inset-bottom)]">
        <button onClick={onClose} aria-label="Close" className="absolute -top-12 right-0 z-10 grid size-11 place-items-center rounded-full border border-line bg-card text-mute hover:text-bone">
          <Icon name="x" className="size-4" />
        </button>
        <CollectionCard c={c} receiving={receiving} closed={closed} startEditing onDone={onClose} />
      </div>
    </div>
  );
}

/** "Edit collection" as a button that opens the edit form in a pop-up. */
export function EditCollectionInfo({ c, receiving, closed, className = GHOST }: { c: C; receiving: boolean; closed: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        Edit collection
      </button>
      {open && <EditDialog c={c} receiving={receiving} closed={closed} onClose={() => setOpen(false)} />}
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
    if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error || "The artwork didn't save. Try again with a JPG, PNG or WebP under 8 MB.");
    else router.refresh();
  }
  return (
    <div className="mt-4 flex items-center gap-4 border-t border-dashed border-line-2 pt-4">
      <div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-[13px] border border-line bg-well">
        {art ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={art} alt={`Artwork for ${name}`} className="size-full object-cover" />
        ) : (
          <span className="px-2 text-center text-[11px] text-mute">No artwork</span>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-bone">Artwork (optional)</p>
        <p className="mt-1 text-[12px] text-mute">Square works best. JPG, PNG or WebP, up to 8 MB. Shown on your link while this collection is receiving.</p>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" aria-label={`Choose artwork for ${name}`} tabIndex={-1} className="sr-only" onChange={(e) => e.target.files?.[0] && send("POST", e.target.files[0])} />
        <div className="mt-2 flex gap-2">
          <button type="button" disabled={busy} onClick={() => input.current?.click()} className={GHOST_TALL}>
            {busy ? "Working…" : art ? "Replace" : "Upload"}
          </button>
          {art && (
            <button type="button" disabled={busy} onClick={() => send("DELETE")} className="tap-text min-h-11 px-2 text-[12px] font-semibold text-mute hover:text-bone">
              Remove
            </button>
          )}
        </div>
        <FormError className="mt-2">{error}</FormError>
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
    <section aria-labelledby={`del-${c.id}`} className="rounded-[18px] border border-danger/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id={`del-${c.id}`} className="text-[13px] font-semibold text-bone">Delete this collection</h2>
          <p className="text-[11.5px] text-mute">{canDelete ? "Its tracks stay in your Queue, unsorted. This can't be undone." : "You need at least one collection, so this one can't be deleted. Make another first."}</p>
        </div>
        {canDelete && !open && (
          <button type="button" onClick={() => setOpen(true)} className={DANGER}>
            Delete…
          </button>
        )}
      </div>
      {canDelete && open && (
        <form method="post"
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (match) start(() => deleteCollection(c.id, typed));
          }}
        >
          <label className="block space-y-1.5">
            <span className="text-[11.5px] text-mute">
              Type <span className="font-mono font-bold text-bone">{want}</span> to confirm
            </span>
            <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus autoComplete="off" spellCheck={false} className="input font-mono" aria-invalid={typed !== "" && !match} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button disabled={!match || pending} className="inline-flex min-h-11 items-center justify-center rounded-[13px] bg-danger px-4 text-[13px] font-semibold text-ink transition disabled:cursor-not-allowed disabled:opacity-40">
              {pending ? "Deleting…" : "Delete collection"}
            </button>
            <button type="button" onClick={() => { setOpen(false); setTyped(""); }} className={GHOST_TALL}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
