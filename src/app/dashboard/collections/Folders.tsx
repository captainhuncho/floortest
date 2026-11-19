"use client";

import { useCoverChoice } from "./CoverChoice";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Kit";
import { FormError } from "@/components/Feedback";
import { useFocusTrap } from "@/components/useFocusTrap";
import { createCollection } from "../actions/collections";
import { createFolder, deleteFolder, fileCallout, fileProject, renameFolder } from "../actions/folders";
import { createProject } from "../actions/music";
import { GHOST, GHOST_TALL, LIME } from "../kitButtons";
import { FolderRow, MoreDots, ROUND } from "./FolderRow";
import type { CollectionsFilter } from "./CollectionsTabs";

/**
 * Folders on Collections (owner, 16 Nov; one list since option 43, 17 Nov): the folders you make yourself (Club nights,
 * 2025) group callouts or projects and sit at the top of the list with the folder shape for a cover. A callout folder
 * holds only callouts, a project folder only projects; the server checks every change (actions/folders.ts).
 */
export type FolderKind = "callout" | "project";
/** preview: up to four of what's inside, newest first; their art makes the folder's cover (option 57 I). */
export type FolderView = { id: number; name: string; count: number; preview: { art: string | null }[]; /** Its own cover, when the owner chose one; else the covers of what's inside. */ art?: string | null };
type Item = { label: string; icon: "folder" | "tag" | "x" | "up"; run: () => void };

const BASE: Record<FolderKind, string> = { callout: "/dashboard/collections", project: "/dashboard/projects" };
const NOUN: Record<FolderKind, string> = { callout: "callout", project: "project" };

/** Options over the whole screen (as the card ··· menus): a sheet on phones, centred from sm. Escape or a tap outside closes it. */
function Sheet({ title, onClose, children, role = "menu" }: { title: string; onClose: () => void; children: React.ReactNode; role?: "menu" | "dialog" }) {
  const box = useRef<HTMLDivElement>(null);
  useFocusTrap(box);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 pb-[max(2rem,env(safe-area-inset-bottom))] backdrop-blur-[2px] sm:items-center" onClick={onClose}>
      <div ref={box} tabIndex={-1} role={role} aria-label={title} aria-modal={role === "dialog" || undefined} onClick={(e) => e.stopPropagation()} className="w-full max-w-sm overflow-hidden rounded-[18px] border border-line bg-card text-[13px] text-bone shadow-pop">
        <p className="truncate border-b border-line px-4 py-3 text-[11.5px] font-semibold text-mute">{title}</p>
        {children}
      </div>
    </div>
  );
}

const ROWS = "flex flex-col divide-y divide-line [&>*]:flex [&>*]:min-h-11 [&>*]:w-full [&>*]:items-center [&>*]:gap-2.5 [&>*]:px-4 [&>*]:py-3 [&>*]:text-left [&>*]:hover:bg-well";

function MenuSheet({ title, items, onClose }: { title: string; items: Item[]; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className={ROWS}>
        {items.map((it) => (
          <button key={it.label} role="menuitem" onClick={() => (onClose(), it.run())}>
            <Icon name={it.icon} className="size-4 text-mute" />
            {it.label}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** A name in a small form (new folder, new callout or project, rename). `extra` adds a field, e.g. "Send new tracks here now". */
function NameSheet({ title, label, initial = "", extra, onSave, onClose }: { title: string; label: string; initial?: string; extra?: React.ReactNode; onSave: (name: string, form: FormData) => Promise<string | null>; onClose: () => void }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <Sheet title={title} onClose={onClose} role="dialog">
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const err = await onSave(String(fd.get("name") ?? ""), fd);
            if (err) setError(err);
            else onClose();
          });
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] text-mute">Name</span>
          <input name="name" defaultValue={initial} className="input max-sm:text-base" autoFocus required maxLength={60} />
        </label>
        {extra}
        <FormError>{error}</FormError>
        <div className="flex gap-2">
          <button className={LIME} disabled={pending}>
            {pending ? "Saving…" : label}
          </button>
          <button type="button" className={GHOST_TALL} onClick={onClose} disabled={pending}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}

type Make = "callout" | "project" | "callout-group" | "project-group";
const MAKE: Record<Make, { title: string; hint: string }> = {
  callout: { title: "Callout", hint: "People send tracks to it through your link" },
  project: { title: "Project", hint: "You add your own tracks, for a set or a release" },
  // Called a folder, like its tile (owner, 19 Nov: "just call it a folder"); the hint says what it holds.
  "callout-group": { title: "Folder", hint: "Holds callouts you already have, like Club nights" },
  "project-group": { title: "Folder", hint: "Holds projects you already have" },
};

/** "New folder": a name, then what goes in it. One lime button. A callout or a project is a folder; a group holds them. */
function NewFolderSheet({ kinds, folder, onClose }: { kinds: Make[]; /** The group being shown: a new project is filed into it. */ folder: number | null; onClose: () => void }) {
  const router = useRouter();
  const [make, setMake] = useState<Make>(kinds[0]);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const create = async (name: string, fd: FormData): Promise<string | null> => {
    if (make === "callout") {
      await createCollection(fd);
    } else if (make === "project") {
      const r = await createProject(name);
      if (!r.ok) return r.error;
      if (folder) await fileProject(r.id, folder);
    } else {
      const r = await createFolder(make === "callout-group" ? "callout" : "project", name);
      if (!r.ok) return r.error;
    }
    router.refresh();
    return null;
  };
  return (
    <Sheet title="New folder" onClose={onClose} role="dialog">
      <form
        className="flex flex-col gap-3 p-4"
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          start(async () => {
            const err = await create(String(fd.get("name") ?? ""), fd);
            if (err) setError(err);
            else onClose();
          });
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className="text-[11.5px] text-mute">Name</span>
          <input name="name" className="input max-sm:text-base" required maxLength={60} />
        </label>
        <fieldset className="flex flex-col">
          <legend className="sr-only">What goes in it</legend>
          {kinds.map((k) => (
            <label key={k} className="flex min-h-11 cursor-pointer items-center gap-3 border-t border-line py-2 first-of-type:border-t-0">
              <input type="radio" name="make" value={k} checked={make === k} onChange={() => setMake(k)} className="size-5 shrink-0 accent-lime" />
              <span className="min-w-0">
                <span className="block text-[13px] font-semibold text-bone">{MAKE[k].title}</span>
                <span className="block text-[11.5px] text-mute">{MAKE[k].hint}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {make === "callout" && (
          <label className="flex min-h-11 items-center gap-2 text-[12px] text-mute">
            <input type="checkbox" name="activate" defaultChecked className="size-4 accent-lime" /> Send new tracks here now
          </label>
        )}
        <FormError>{error}</FormError>
        <div className="flex gap-2">
          <button className={`${LIME} flex-1`} disabled={pending}>
            {pending ? "Creating…" : "Create folder"}
          </button>
          <button type="button" className={GHOST_TALL} onClick={onClose} disabled={pending}>
            Cancel
          </button>
        </div>
      </form>
    </Sheet>
  );
}

/**
 * The head and list area of Collections: the title with "New folder" beside it (a + on phones), and the same sheet on a
 * right-click on empty space (or Shift+F10 / the menu key). A right-click on a folder opens that folder's own ···
 * options. Links, fields and selected text keep the browser's menu. Inside a group, a new project is filed into it.
 */
export function FolderArea({ view, folder, canEdit, canCreate = canEdit, label, children }: { /** Which filter is on: it decides what can be made here. */ view: CollectionsFilter; /** The group being shown, if any. */ folder?: number | null; /** Projects and groups: make, rename, delete (owner and A&R / Admin). */ canEdit: boolean; /** A new callout: a ticked Member may make callouts without managing projects or groups. Defaults to canEdit. */ canCreate?: boolean; /** A small line over the title. */ label?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // A new callout can't be filed yet (createCollection doesn't return its id), so inside a group of callouts it isn't
  // offered; a group holds no groups.
  const kinds: Make[] = [
    ...(canCreate && view !== "projects" && !folder ? (["callout"] as const) : []),
    ...(canEdit && view !== "callouts" ? (["project"] as const) : []),
    ...(canEdit && view !== "projects" && !folder ? (["callout-group"] as const) : []),
    ...(canEdit && view !== "callouts" && !folder ? (["project-group"] as const) : []),
  ];
  const can = (canEdit || canCreate) && kinds.length > 0;
  const onContextMenu = (e: React.MouseEvent) => {
    if (!canEdit && !canCreate) return;
    const t = e.target as HTMLElement;
    const card = t.closest<HTMLElement>("[data-card]");
    if (card) {
      e.preventDefault();
      card.querySelector<HTMLButtonElement>("[aria-haspopup=menu]")?.click();
      return;
    }
    if (!can || t.closest("a, input, textarea, select, [contenteditable]") || String(window.getSelection() ?? "")) return;
    e.preventDefault();
    setOpen(true);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((!canEdit && !canCreate) || !(e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey))) return;
    e.preventDefault();
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-card]");
    if (card) card.querySelector<HTMLButtonElement>("[aria-haspopup=menu]")?.click();
    else if (can) setOpen(true);
  };

  return (
    <div className="flex flex-col gap-3 md:gap-4" onContextMenu={onContextMenu} onKeyDown={onKeyDown}>
      <header className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          {label && <p className="text-[11.5px] text-mute">{label}</p>}
          <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-bone">Collections</h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canEdit && view === "projects" && (
            <button className={GHOST_TALL} onClick={() => window.dispatchEvent(new Event("ft:add-audio"))}>
              <Icon name="up" className="size-4" />
              Upload audio
            </button>
          )}
          {can && (
            <button className={`${GHOST_TALL} max-md:size-11 max-md:rounded-full max-md:px-0!`} aria-haspopup="dialog" aria-label="New folder" onClick={() => setOpen(true)}>
              <Icon name="plus" className="size-4" />
              <span className="max-md:hidden">New folder</span>
            </button>
          )}
        </div>
      </header>
      {children}
      {open && <NewFolderSheet kinds={kinds} folder={folder ?? null} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** One of your own folders in the list: the covers of what's inside (newest first), its name and how much is in it. The whole row opens it; ··· renames or deletes. */
export function FolderTile({ kind, f, canEdit }: { kind: FolderKind; f: FolderView; canEdit: boolean }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const cover = useCoverChoice("folder", f.id, f.name);
  const holds = `${f.count} ${f.count === 1 ? NOUN[kind] : `${NOUN[kind]}s`}`;
  return (
    <FolderRow
      href={`${BASE[kind]}?folder=${f.id}`}
      name={f.name}
      spoken={`Open ${f.name}, folder, ${holds}`}
      covers={f.art ? [f.art] : f.preview.flatMap((p) => (p.art ? [p.art] : []))}
      empty={f.count === 0 && !f.art}
      line={`Folder · ${holds}`}
      menu={
        canEdit && (
          <button onClick={() => setMenu(true)} aria-haspopup="menu" aria-label={`More for ${f.name}`} className={ROUND}>
            <MoreDots />
          </button>
        )
      }
    >
      {cover.picker}
      {menu && (
        <MenuSheet
          title={f.name}
          onClose={() => setMenu(false)}
          items={[
            { label: "Open", icon: "folder", run: () => router.push(`${BASE[kind]}?folder=${f.id}`) },
            { label: "Rename", icon: "tag", run: () => setRename(true) },
            { label: "Change cover", icon: "up", run: cover.choose },
            ...(f.art ? [{ label: "Remove cover", icon: "x" as const, run: cover.remove }] : []),
            { label: "Delete folder", icon: "x", run: () => setConfirm(true) },
          ]}
        />
      )}
      {rename && (
        <NameSheet
          title="Rename folder"
          label="Save"
          initial={f.name}
          onClose={() => setRename(false)}
          onSave={async (name) => {
            const r = await renameFolder(kind, f.id, name);
            return r.ok ? null : r.error;
          }}
        />
      )}
      {confirm && (
        <Sheet title={`Delete ${f.name}?`} onClose={() => setConfirm(false)} role="dialog">
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[12px] text-mute">The folder goes. The {NOUN[kind]}s in it stay, in no folder.</p>
            <div className="flex gap-2">
              <button className={GHOST_TALL} disabled={pending} onClick={() => start(async () => { await deleteFolder(kind, f.id); setConfirm(false); })}>
                {pending ? "Deleting…" : "Delete folder"}
              </button>
              <button className={GHOST} onClick={() => setConfirm(false)} disabled={pending}>
                Cancel
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </FolderRow>
  );
}

/** "Move to folder" for one callout or project: the desk's folders of that kind, and "No folder". */
export function MoveToFolder({ kind, itemId, itemName, current, folders, onClose }: { kind: FolderKind; itemId: number; itemName: string; current: number | null; folders: { id: number; name: string }[]; onClose: () => void }) {
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const move = (to: number | null) =>
    start(async () => {
      const r = await (kind === "callout" ? fileCallout(itemId, to) : fileProject(itemId, to));
      if (r.ok) onClose();
      else setError(r.error);
    });
  return (
    <Sheet title={`Move ${itemName} to`} onClose={onClose}>
      <div className={ROWS}>
        {folders.map((f) => (
          <button key={f.id} role="menuitemradio" aria-checked={current === f.id} disabled={pending || current === f.id} onClick={() => move(f.id)}>
            <Icon name="folder" className="size-4 text-mute" />
            <span className="min-w-0 flex-1 truncate">{f.name}</span>
            {current === f.id && <Icon name="tick" className="size-4 text-lime" />}
          </button>
        ))}
        <button role="menuitemradio" aria-checked={current === null} disabled={pending || current === null} onClick={() => move(null)}>
          <span className="min-w-0 flex-1">No folder</span>
          {current === null && <Icon name="tick" className="size-4 text-lime" />}
        </button>
      </div>
      <FormError className="px-4 pb-3">{error}</FormError>
    </Sheet>
  );
}

/** The heading inside a folder: back to the whole list, and the folder's name. */
export function FolderCrumb({ kind, name }: { kind: FolderKind; name: string }) {
  return (
    <div className="flex items-center gap-2">
      <Link href={BASE[kind]} className={`${GHOST} gap-1`}>
        <Icon name="chev" className="size-3.5 rotate-180" />
        All {NOUN[kind]}s
      </Link>
      <h2 className="min-w-0 truncate text-[15px] font-semibold text-bone">{name}</h2>
    </div>
  );
}
