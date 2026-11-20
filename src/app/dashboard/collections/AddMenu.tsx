"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/Kit";
import { createCollection } from "../actions/collections";
import { createFolder, fileProject } from "../actions/folders";
import { createProject } from "../actions/music";
import { NameSheet } from "./Folders";
import { addItems, type AddKind as Kind, type CollectionsTab as AddTab } from "./add-items";

/**
 * "+ Add" on Collections (owner, 20 Nov: option 66). One button per tab, the word visible next to the plus. Phones: a
 * lime pill floating bottom-right above the mini player, the menu and the safe area; its menu opens just above it with a
 * scrim behind, and the button reads "Close". From 768px: the same button in the tab header, aligned right; the menu
 * opens under it, with no scrim. Callouts offers Callout and Folder; Projects offers Import, Project and Folder. Each
 * item opens the name sheet it needs (a new project opens its page); Import opens the file picker (OwnerUpload).
 */
/** The floating button sits this far above the phone's player-and-menu pair. */
const GAP = 12;

/** Height of the phone's bottom pair (mini player and menu), kept up to date; 0 from md, where it isn't shown. */
function usePairHeight() {
  const [h, setH] = useState(0);
  useLayoutEffect(() => {
    const pair = document.querySelector<HTMLElement>("[data-bottom-pair]");
    if (!pair) return;
    const read = () => setH(pair.offsetHeight);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(pair);
    return () => ro.disconnect();
  }, []);
  return h;
}

export function AddMenu({ tab, folder, canEdit, canCreate = canEdit }: { tab: AddTab; /** The folder being shown: a new project is filed into it. */ folder: number | null; /** Projects and folders (owner and A&R / Admin). */ canEdit: boolean; /** A new callout: a ticked Member too. */ canCreate?: boolean }) {
  const router = useRouter();
  const items = addItems({ tab, inFolder: folder !== null, canEdit, canCreate });
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<Kind | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const pair = usePairHeight();
  const menuId = `add-menu-${tab}`;

  const close = useCallback((refocus = true) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  // Right-click on empty space (or Shift+F10 / the menu key) on the page opens this menu (FolderArea asks by event).
  useEffect(() => {
    if (!items.length) return;
    const show = () => setOpen(true);
    window.addEventListener("ft:add-menu", show);
    return () => window.removeEventListener("ft:add-menu", show);
  }, [items.length]);

  // Focus the first item on open; Escape or a tap outside closes it.
  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>("[role=menuitem]")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!menu.current?.contains(t) && !button.current?.contains(t)) close(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [open, close]);

  if (!items.length) return null;

  const pick = (kind: Kind) => {
    close(false);
    // The file picker must open inside the tap for iOS Safari, so Import asks OwnerUpload straight away.
    if (kind === "import") window.dispatchEvent(new Event("ft:add-audio"));
    else setSheet(kind);
  };

  const onMenuKey = (e: React.KeyboardEvent<HTMLUListElement>) => {
    const all = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=menuitem]")];
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[e.key];
    if (e.key === "Tab") return close(false);
    if (to === undefined) return;
    e.preventDefault();
    all[(to + all.length) % all.length]?.focus();
  };

  // Phones: fixed above the bottom pair and the safe area. From md: in the tab header.
  const lift = { "--add-lift": `calc(${pair}px + max(0.75rem, env(safe-area-inset-bottom)) + ${GAP}px)` } as React.CSSProperties;

  return (
    <div className="md:relative" style={lift}>
      {open && <div aria-hidden className="fixed inset-0 z-[45] bg-black/45 md:hidden" />}
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => (open ? close() : setOpen(true))}
        className="btn-lime fixed bottom-(--add-lift) right-[max(1rem,env(safe-area-inset-right))] z-50 inline-flex h-[52px] items-center gap-1.5 rounded-full pl-4! pr-5! text-[16px]! font-bold md:static md:h-11 md:rounded-[13px] md:px-4! md:text-[13px]! md:font-semibold"
      >
        {/* Phones: "× Close" while the menu is open; from md it stays "+ Add" (aria-expanded says it's open). */}
        <Icon name="plus" className={`size-[18px] md:size-4 ${open ? "max-md:hidden" : ""}`} />
        {open && <Icon name="x" className="size-[18px] md:hidden" />}
        {open ? (
          <>
            <span className="md:hidden">Close</span>
            <span className="hidden md:inline">Add</span>
          </>
        ) : (
          "Add"
        )}
      </button>
      {open && (
        <ul
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={tab === "callouts" ? "Add to Callouts" : "Add to Projects"}
          onKeyDown={onMenuKey}
          className="fixed bottom-[calc(var(--add-lift)+60px)] right-[max(1rem,env(safe-area-inset-right))] z-50 w-[min(270px,calc(100vw-2rem))] rounded-[18px] border border-line bg-card p-1.5 md:absolute md:bottom-auto md:right-0 md:top-[calc(100%+8px)]"
        >
          {items.map((it) => (
            <li key={it.kind} role="none">
              <button type="button" role="menuitem" onClick={() => pick(it.kind)} className="flex min-h-14 w-full items-center gap-3 rounded-[12px] px-2.5 py-1.5 text-left outline-none focus-visible:bg-well hover:bg-well">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-well text-bone">
                  <Icon name={it.icon} className="size-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[15px] font-semibold text-bone">{it.name}</span>
                  <span className="block text-[12px] leading-snug text-mute">{it.line}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {sheet === "callout" && (
        <NameSheet
          title="New callout"
          label="Create callout"
          extra={
            <label className="flex min-h-11 items-center gap-2 text-[12px] text-mute">
              <input type="checkbox" name="activate" defaultChecked className="size-4 accent-lime" /> Send new tracks here now
            </label>
          }
          onClose={() => setSheet(null)}
          onSave={async (_name, fd) => {
            await createCollection(fd);
            router.refresh();
            return null;
          }}
        />
      )}
      {sheet === "project" && (
        <NameSheet
          title="New project"
          label="Create project"
          onClose={() => setSheet(null)}
          onSave={async (name) => {
            const r = await createProject(name);
            if (!r.ok) return r.error;
            if (folder) await fileProject(r.id, folder);
            router.push(`/dashboard/projects/${r.id}`);
            return null;
          }}
        />
      )}
      {sheet === "folder" && (
        <NameSheet
          title="New folder"
          label="Create folder"
          onClose={() => setSheet(null)}
          onSave={async (name) => {
            const r = await createFolder(tab === "callouts" ? "callout" : "project", name);
            if (!r.ok) return r.error;
            router.refresh();
            return null;
          }}
        />
      )}
    </div>
  );
}
