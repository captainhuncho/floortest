"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CARD, Icon, NameCover, type IconName } from "@/components/Kit";
import { FormError } from "@/components/Feedback";
import { useFocusTrap } from "@/components/useFocusTrap";
import { createCollection } from "../actions/collections";
import { createFolder, deleteFolder, fileCallout, fileProject, renameFolder } from "../actions/folders";
import { createProject } from "../actions/music";
import { GHOST, GHOST_TALL, LIME } from "../kitButtons";

/**
 * Folders on Callouts and Projects (owner, 16 Nov): one "+" that drops down what you can make here, folder tiles that
 * show their first four items as a 2×2 cover grid, and the same menu on a right-click. A callout folder holds only
 * callouts, a project folder only projects; the server checks every change (actions/folders.ts).
 */
export type FolderKind = "callout" | "project";
export type FolderView = { id: number; name: string; count: number; preview: { id: number; name: string; art: string | null }[] };
type Item = { label: string; icon: IconName; run: () => void };

const BASE: Record<FolderKind, string> = { callout: "/dashboard/collections", project: "/dashboard/projects" };
const NOUN: Record<FolderKind, string> = { callout: "callout", project: "project" };

// No artwork: a default cover with the item's name (Kit NameCover), as on callout and project tiles.
function ItemCover({ name, art }: { name: string; art: string | null }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (art) return <img src={art} alt="" className="size-full object-cover" />;
  return <NameCover name={name} size="size-full rounded-none! border-0!" text="text-[6px] leading-[1.15]" />;
}

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

/**
 * The list area of Callouts or Projects: a "+ New" button above it and the same menu on a right-click on empty space
 * (or Shift+F10 / the menu key). A right-click on a card opens that card's own ··· options. Links, fields and selected
 * text keep the browser's menu. Inside a folder, what you make is filed into it.
 */
export function FolderArea({ kind, folder, canEdit, canCreate = canEdit, children }: {
  kind: FolderKind;
  /** The folder being shown, if any. */
  folder?: number | null;
  /** Folders: make, rename, delete (owner and A&R / Admin). */
  canEdit: boolean;
  /** "New callout" / "New project": a ticked Member may make callouts without managing folders. Defaults to canEdit. */
  canCreate?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [form, setForm] = useState<null | "folder" | "item">(null);
  const fileInto = async (id: number) => {
    if (folder) await (kind === "callout" ? fileCallout(id, folder) : fileProject(id, folder));
  };
  const items: Item[] = [
    ...(kind === "project" ? [{ label: "Upload audio", icon: "up" as const, run: () => window.dispatchEvent(new Event("ft:add-audio")) }] : []),
    // A new callout can't be filed yet (createCollection doesn't return its id), so inside a callout folder it isn't offered.
    ...(!canCreate || (kind === "callout" && folder) ? [] : [{ label: `New ${NOUN[kind]}`, icon: (kind === "callout" ? "inbox" : "music") as IconName, run: () => setForm("item") }]),
    ...(!canEdit || folder ? [] : [{ label: "New folder", icon: "folder" as const, run: () => setForm("folder") }]),
  ];

  const can = items.length > 0;
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
    setMenu(true);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((!canEdit && !canCreate) || !(e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey))) return;
    e.preventDefault();
    const card = (e.target as HTMLElement).closest<HTMLElement>("[data-card]");
    if (card) card.querySelector<HTMLButtonElement>("[aria-haspopup=menu]")?.click();
    else if (can) setMenu(true);
  };

  return (
    <div className="flex flex-col gap-3" onContextMenu={onContextMenu} onKeyDown={onKeyDown}>
      {can && (
        <div className="flex justify-end">
          <button className={`${LIME} gap-1.5`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(true)}>
            <Icon name="plus" className="size-4" />
            New
          </button>
        </div>
      )}
      {children}
      {menu && <MenuSheet title="New" items={items} onClose={() => setMenu(false)} />}
      {form === "folder" && (
        <NameSheet
          title={`New ${NOUN[kind]} folder`}
          label="Create"
          onClose={() => setForm(null)}
          onSave={async (name) => {
            const r = await createFolder(kind, name);
            return r.ok ? null : r.error;
          }}
        />
      )}
      {form === "item" && kind === "callout" && (
        <NameSheet
          title="New callout"
          label="Create"
          onClose={() => setForm(null)}
          extra={
            <label className="flex min-h-11 items-center gap-2 text-[12px] text-mute">
              <input type="checkbox" name="activate" defaultChecked className="size-4 accent-lime" /> Send new tracks here now
            </label>
          }
          onSave={async (_name, fd) => {
            await createCollection(fd);
            router.refresh();
            return null;
          }}
        />
      )}
      {form === "item" && kind === "project" && (
        <NameSheet
          title="New project"
          label="Create"
          onClose={() => setForm(null)}
          onSave={async (name) => {
            const r = await createProject(name);
            if (!r.ok) return r.error;
            await fileInto(r.id);
            router.refresh();
            return null;
          }}
        />
      )}
    </div>
  );
}

/** A folder as a tile: its first four items as a 2×2 cover grid, its name and count. The whole tile opens it; ··· renames or deletes. */
export function FolderTile({ kind, f, canEdit }: { kind: FolderKind; f: FolderView; canEdit: boolean }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [rename, setRename] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pending, start] = useTransition();
  const cells = Array.from({ length: 4 }, (_, i) => f.preview[i]);
  return (
    // A row the height of a callout card's header (owner, 16 Nov): a small 2×2 of the first covers, then the name.
    <div data-card className={`relative flex flex-col ${CARD} p-3`}>
      <div className="flex items-center gap-3">
        <div aria-hidden className="grid size-[60px] shrink-0 grid-cols-2 gap-0.5 overflow-hidden rounded-[10px]">
          {cells.map((p, i) => (
            <span key={p?.id ?? `empty-${i}`} className="block overflow-hidden rounded-[4px] bg-well">
              {p ? <ItemCover name={p.name} art={p.art} /> : null}
            </span>
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`${BASE[kind]}?folder=${f.id}`} className="block truncate text-[15px] font-semibold tracking-[-0.015em] text-bone after:absolute after:inset-0 after:rounded-[18px]">
            {f.name}
          </Link>
          <p className="mt-0.5 text-[11.5px] text-mute tnum">
            {f.count} {f.count === 1 ? NOUN[kind] : `${NOUN[kind]}s`}
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setMenu(true)} aria-haspopup="menu" aria-label={`More for ${f.name}`} className="relative z-10 grid size-11 shrink-0 place-items-center rounded-[12px] border border-line bg-well text-mute hover:text-bone">
            <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
              <circle cx="6" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="18" cy="12" r="1.6" />
            </svg>
          </button>
        )}
      </div>
      {menu && (
        <MenuSheet
          title={f.name}
          onClose={() => setMenu(false)}
          items={[
            { label: "Open", icon: "folder", run: () => router.push(`${BASE[kind]}?folder=${f.id}`) },
            { label: "Rename", icon: "tag", run: () => setRename(true) },
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
    </div>
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
