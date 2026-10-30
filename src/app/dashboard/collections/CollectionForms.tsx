"use client";

import { useFocusTrap } from "@/components/useFocusTrap";
import Link from "next/link";
import { useEffect, useId, useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import { createCollection, deleteCollection, setActiveCollection, updateCollection } from "../actions/collections";
import { DownloadActions } from "../DownloadActions";
import { GenresField } from "./GenresField";
import { CARD, Chip, Cover, Icon, IconBox, initials } from "@/components/Kit";
import { LinkRow } from "../floor/FloorClient";
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

/** The ··· on a card or page head; Kit has no "more" icon, so it's drawn here. */
function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  );
}

/** The collection's artwork, or its initials on a cover square when it has none. */
function CollectionCover({ c }: { c: Pick<C, "name" | "art"> }) {
  if (!c.art) return <Cover text={initials(c.name)} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={c.art} alt="" className="size-[38px] shrink-0 rounded-[10px] border border-line object-cover" />;
}

/**
 * How full a capped callout is, as a row of ticks (the mock's capacity strip), with the numbers in text beside it.
 * Any track at all fills one tick, and only a full callout fills the last.
 */
export function CapTicks({ used, limit, cells = 25 }: { used: number; limit: number; cells?: number }) {
  const filled = used <= 0 ? 0 : used >= limit ? cells : Math.min(cells - 1, Math.max(1, Math.round((used / limit) * cells)));
  return (
    <div className="flex items-center gap-2">
      <div aria-hidden className="flex h-3.5 flex-1 gap-[2px]">
        {Array.from({ length: cells }, (_, i) => (
          <span key={i} className={`flex-1 rounded-[2px] ${i < filled ? "bg-lime" : "bg-line-2"}`} />
        ))}
      </div>
      <span className="shrink-0 font-mono text-[11px] text-mute tnum">
        {used} of {limit}
      </span>
    </div>
  );
}

export function CollectionCard({ c, receiving, closed, canManage = true, startEditing = false }: { c: C; receiving: boolean; closed: boolean; canManage?: boolean; startEditing?: boolean }) {
  const [editing, setEditing] = useState(startEditing);
  const [pending, start] = useTransition();

  return (
    <div className={`${CARD} p-3 sm:p-4 ${receiving && !closed ? "border-lime/55" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold tracking-[-0.015em] text-bone">
            <Link href={`/dashboard/collections/${c.id}`} className="underline-offset-4 hover:underline">
              {c.name}
            </Link>
            {(receiving || closed) && <StateChip live={receiving && !closed} closed={closed} full={c.full} closesLabel={null} idle="" />}
          </h2>
          <p className="mt-1 text-[12px] text-mute">
            <Link href={`/dashboard/collections/${c.id}`} className="hover:text-bone">
              <b className="font-semibold text-lime tnum">{c.needsReview}</b> need review · <b className="font-semibold text-bone tnum">{c.kept}</b> kept · <b className="font-semibold text-bone tnum">{c.count}</b> total · Open folder →
            </Link>
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
        <div className="flex flex-wrap gap-2">
          <Link href={`/dashboard/collections/${c.id}`} className={GHOST}>
            Open collection
          </Link>
          <DownloadActions collectionId={c.id} crateName={c.name} count={c.count} size="sm" />
          {!receiving && canManage && (
            <button className={GHOST} disabled={pending} onClick={() => start(() => setActiveCollection(c.id))}>
              Send new tracks here
            </button>
          )}
          <button className={GHOST} onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
            Edit
          </button>
        </div>
      </div>
      {editing && (
        <form
          className="mt-4 grid gap-3.5 border-t border-dashed border-line-2 pt-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
          action={(fd) =>
            start(async () => {
              fd.set("tz", String(new Date().getTimezoneOffset()));
              await updateCollection(c.id, fd);
              setEditing(false);
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
          <div className="flex gap-2">
            <button className={LIME} disabled={pending}>
              Save
            </button>
          </div>
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
 * One callout as a card (the mock): cover, name and where it stands; to review, kept and tracks; how full it is if
 * capped; the link while it's receiving; then the one next step. The whole card opens it; ··· has every option.
 */
export function CollectionTile({ c, receiving, closed, canManage = true, link }: { c: C; receiving: boolean; closed: boolean; /** Owner or A&R / Admin: may change where the link sends tracks. */ canManage?: boolean; /** The desk's public link, shown on the receiving card. */ link?: string }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();
  const live = receiving && !closed;
  const bpm = c.bpmMin || c.bpmMax ? [c.bpmMin, c.bpmMax].filter(Boolean).join("–") : null;
  const figures: [string, number][] = [
    ["To review", c.needsReview],
    ["Kept", c.kept],
    ["Tracks", c.count],
  ];
  return (
    <div className={`relative flex flex-col gap-2.5 ${CARD} p-3 ${live ? "border-lime/55" : ""}`}>
      <div className="flex items-start gap-2.5">
        <CollectionCover c={c} />
        <div className="min-w-0 flex-1">
          <Link
            href={`/dashboard/collections/${c.id}`}
            className="block truncate text-[15px] font-semibold tracking-[-0.015em] text-bone after:absolute after:inset-0 after:rounded-[18px]"
          >
            {c.name}
          </Link>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-mute">
            <StateChip live={live} closed={closed} full={c.full} closesLabel={c.closesLabel} idle="Open" />
            {!closed && c.closesLabel && <span>Closes {c.closesLabel}</span>}
          </p>
        </div>
        <button
          onClick={() => setMenu((m) => !m)}
          aria-haspopup="menu"
          aria-label={`More for ${c.name}`}
          className="relative z-10 grid size-11 shrink-0 place-items-center rounded-[12px] border border-line bg-well text-mute hover:text-bone"
        >
          <MoreIcon />
        </button>
      </div>
      <dl className="grid grid-cols-3 text-center">
        {figures.map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <dt className="text-[11.5px] text-mute">{k}</dt>
            <dd className="text-[16px] font-semibold leading-tight text-bone tnum">{v}</dd>
          </div>
        ))}
      </dl>
      {c.maxTracks ? <CapTicks used={c.count} limit={c.maxTracks} /> : null}
      {live && link && (
        <div className="relative z-10 flex flex-col gap-1.5">
          <p className="text-[11.5px] text-mute">Your link sends here</p>
          <LinkRow link={link} />
        </div>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2">
        {c.needsReview > 0 && !closed ? (
          <Link href={`/dashboard/review?view=queue&c=${c.id}`} className={`${GHOST} relative z-10`}>
            <Icon name="inbox" className="size-[15px]" />
            Review {c.needsReview} new
          </Link>
        ) : (
          <span className="text-[11.5px] text-mute">{closed ? "No longer taking tracks" : live ? "Nothing new to review" : "Not receiving"}</span>
        )}
        {!live && !closed && canManage ? (
          <button className={`${GHOST} relative z-10`} disabled={pending} onClick={() => start(() => setActiveCollection(c.id))}>
            <Icon name="send" className="size-[15px]" />
            Send new tracks here
          </button>
        ) : bpm ? (
          <span className="text-[11.5px] text-mute tnum">{bpm} BPM</span>
        ) : null}
      </div>
      {menu && <CollectionOptions c={c} receiving={receiving} canManage={canManage} onEdit={() => setEditing(true)} onClose={() => setMenu(false)} showOpen />}
      {editing && <EditDialog c={c} receiving={receiving} closed={closed} canManage={canManage} onClose={() => setEditing(false)} />}
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

/** A collection page's head, every screen size: back to Collections, cover, name, where it stands, and ··· options. */
export function CollectionDetailHeader({ c, receiving, closed, canManage = true }: { c: C; receiving: boolean; closed: boolean; /** Owner or A&R / Admin: may change where the link sends tracks. */ canManage?: boolean }) {
  const [menu, setMenu] = useState(false);
  const [editing, setEditing] = useState(false);
  return (
    <header className="flex flex-col gap-1.5">
      <Link href="/dashboard/collections" aria-label="Back to Collections" className="-my-2 inline-flex min-h-11 w-fit items-center gap-1 text-[12px] text-mute hover:text-bone">
        <Icon name="chev" className="size-3.5 rotate-180" />
        Collections
      </Link>
      <div className="flex items-center gap-2.5">
        <CollectionCover c={c} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.025em] text-bone">{c.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-mute">
            <StateChip live={receiving && !closed} closed={closed} full={c.full} closesLabel={c.closesLabel} idle="Not receiving" />
            {!closed && c.closesLabel && <span>Closes {c.closesLabel}</span>}
          </p>
        </div>
        <button
          onClick={() => setMenu(true)}
          aria-haspopup="menu"
          aria-label={`Options for ${c.name}`}
          className="grid size-11 shrink-0 place-items-center rounded-[12px] border border-line bg-well text-mute hover:text-bone"
        >
          <MoreIcon />
        </button>
      </div>
      {menu && <CollectionOptions c={c} receiving={receiving} canManage={canManage} onEdit={() => setEditing(true)} onClose={() => setMenu(false)} showOpen={false} />}
      {editing && <EditDialog c={c} receiving={receiving} closed={closed} canManage={canManage} onClose={() => setEditing(false)} />}
    </header>
  );
}

/** The edit form in a pop-up over the page. Tap outside, Escape or ✕ to close. */
function EditDialog({ c, receiving, closed, canManage, onClose }: { c: C; receiving: boolean; closed: boolean; canManage: boolean; onClose: () => void }) {
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
        <CollectionCard c={c} receiving={receiving} closed={closed} canManage={canManage} startEditing />
      </div>
    </div>
  );
}

/** "Edit collection" as a button that opens the edit form in a pop-up. */
export function EditCollectionInfo({ c, receiving, closed, canManage = true, className = GHOST }: { c: C; receiving: boolean; closed: boolean; /** Owner or A&R / Admin: may change where the link sends tracks. */ canManage?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} className={className}>
        Edit collection
      </button>
      {open && <EditDialog c={c} receiving={receiving} closed={closed} canManage={canManage} onClose={() => setOpen(false)} />}
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
        {error && (
          <p role="alert" className="mt-2 text-[12px] text-danger">
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
        <form
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
