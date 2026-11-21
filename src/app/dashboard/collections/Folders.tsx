"use client";

import { useCoverChoice } from "./CoverChoice";
import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Kit";
import { FormError } from "@/components/Feedback";
import { useFocusTrap } from "@/components/useFocusTrap";
import { deleteFolder, fileCallout, fileProject, renameFolder } from "../actions/folders";
import { GHOST, GHOST_TALL, LIME } from "../kitButtons";
import { FolderRow, MoreDots, ROUND } from "./FolderRow";

/**
 * Folders on Collections (owner, 16 Nov; one list since option 43, 17 Nov): the folders you make yourself (Club nights,
 * 2025) group callouts or projects and sit at the top of the list with the folder shape for a cover. A callout folder
 * holds only callouts, a project folder only projects; the server checks every change (actions/folders.ts).
 */
export type FolderKind = "callout" | "project";
/** preview: up to four of what's inside, newest first; their art makes the folder's cover (option 57 I). */
export type FolderView = { id: number; name: string; count: number; preview: { art: string | null }[]; /** Its own cover, when the owner chose one; else the covers of what's inside. */ art?: string | null };
type Item = { label: string; icon: "folder" | "tag" | "x" | "up"; run: () => void };

/** Each tab of Collections (option 66): the list, and one folder in it. */
const BASE: Record<FolderKind, string> = { callout: "/dashboard/collections?tab=callouts", project: "/dashboard/collections?tab=projects" };
export const folderHref = (kind: FolderKind, id: number) => `${BASE[kind]}&folder=${id}`;
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

/** Arrow keys, Home and End move between a menu's items (as + Add's menu does). */
function onMenuKey(e: React.KeyboardEvent<HTMLElement>) {
  const all = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]")];
  const at = all.indexOf(document.activeElement as HTMLButtonElement);
  const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  all[(to + all.length) % all.length]?.focus();
}

function MenuSheet({ title, items, onClose }: { title: string; items: Item[]; onClose: () => void }) {
  return (
    <Sheet title={title} onClose={onClose}>
      <div className={ROWS} onKeyDown={onMenuKey}>
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
export function NameSheet({ title, label, initial = "", extra, onSave, onClose }: { title: string; label: string; initial?: string; extra?: React.ReactNode; onSave: (name: string, form: FormData) => Promise<string | null>; onClose: () => void }) {
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

/**
 * The head and list area of Collections: the title, then the page. A right-click on empty space (or Shift+F10 / the
 * menu key) opens the tab's + Add menu (AddMenu, asked by event); a right-click on a folder opens that folder's own ···
 * options. Links, fields and selected text keep the browser's menu.
 */
export function FolderArea({ canAdd, label, children }: { /** Someone here may add something (the + Add menu has items). */ canAdd: boolean; /** A small line over the title. */ label?: React.ReactNode; children: React.ReactNode }) {
  const addMenu = () => window.dispatchEvent(new Event("ft:add-menu"));
  const onContextMenu = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    const card = t.closest<HTMLElement>("[data-card]");
    if (card) {
      const more = card.querySelector<HTMLButtonElement>("[aria-haspopup=menu]");
      if (!more) return;
      e.preventDefault();
      more.click();
      return;
    }
    if (!canAdd || t.closest("a, button, input, textarea, select, [contenteditable], [role=menu]") || String(window.getSelection() ?? "")) return;
    e.preventDefault();
    addMenu();
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey))) return;
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-card]");
    const more = card?.querySelector<HTMLButtonElement>("[aria-haspopup=menu]");
    if (more) {
      e.preventDefault();
      more.click();
    } else if (canAdd && !card) {
      e.preventDefault();
      addMenu();
    }
  };

  return (
    <div className="flex flex-col gap-3 md:gap-4" onContextMenu={onContextMenu} onKeyDown={onKeyDown}>
      <header className="min-w-0">
        {label && <p className="text-[11.5px] text-mute">{label}</p>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-bone">Collections</h1>
      </header>
      {children}
    </div>
  );
}

/** One of your own folders in the list: the covers of what's inside (newest first), its name and how much is in it. The whole row opens it; ··· renames or deletes. */
export function FolderTile({ kind, f, canEdit, tile = false }: { kind: FolderKind; f: FolderView; canEdit: boolean; /** A tile on phones too (Projects, option 63 A). */ tile?: boolean }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [pending, start] = useTransition();
  const cover = useCoverChoice("folder", f.id, f.name);
  // A delete that doesn't go through keeps the dialog open and says why (20 Nov: a refused or lost call closed it silently).
  // While it runs the buttons are aria-disabled, not disabled, so keyboard focus stays on them (a disabled button drops
  // focus to the page, and it never came back after a refusal).
  const remove = () =>
    !pending &&
    start(async () => {
      setDeleteError("");
      const r = await deleteFolder(kind, f.id).catch(() => ({ ok: false as const, error: "Couldn't delete the folder. Try again." }));
      if (!r.ok) return setDeleteError(r.error);
      setConfirm(false);
      router.refresh();
    });
  const closeConfirm = () => {
    setConfirm(false);
    setDeleteError("");
  };
  const holds = `${f.count} ${f.count === 1 ? NOUN[kind] : `${NOUN[kind]}s`}`;
  return (
    <FolderRow
      href={folderHref(kind, f.id)}
      name={f.name}
      spoken={`Open ${f.name}, folder, ${holds}`}
      covers={f.art ? [f.art] : f.preview.flatMap((p) => (p.art ? [p.art] : []))}
      empty={f.count === 0 && !f.art}
      line={`Folder · ${holds}`}
      tile={tile}
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
            { label: "Open", icon: "folder", run: () => router.push(folderHref(kind, f.id)) },
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
        <Sheet title={`Delete ${f.name}?`} onClose={closeConfirm} role="dialog">
          <div className="flex flex-col gap-3 p-4">
            <p className="text-[12px] text-mute">The folder goes. The {NOUN[kind]}s in it stay, in no folder.</p>
            <FormError>{deleteError}</FormError>
            <div className="flex gap-2">
              <button className={`${GHOST_TALL} aria-disabled:cursor-not-allowed aria-disabled:opacity-40`} aria-disabled={pending || undefined} onClick={remove}>
                {pending ? "Deleting…" : "Delete folder"}
              </button>
              {/* Focus starts on Cancel, not on the destructive button. */}
              <button className={`${GHOST} aria-disabled:cursor-not-allowed aria-disabled:opacity-40`} aria-disabled={pending || undefined} onClick={() => !pending && closeConfirm()} autoFocus>
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
