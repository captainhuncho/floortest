"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CARD, Icon, IconBox } from "@/components/Kit";
import { useConfirm } from "@/components/Dialog";
import { FormError } from "@/components/Feedback";
import { useFocusTrap } from "@/components/useFocusTrap";
import { useToast } from "@/components/Toast";
import { createProject, deleteProject, renameProject } from "../actions/music";
import { GHOST_TALL, LIME } from "../kitButtons";
import { MoveToFolder } from "../collections/Folders";
import { FolderRow, MoreDots, ROUND, trackCount } from "../collections/FolderRow";
import { useCoverChoice } from "../collections/CoverChoice";

export type ProjectView = { id: number; name: string; count: number; duration: number; /** Its own cover, when the owner chose one. */ art?: string | null };

/** The ··· on a card or page head (as on Collections). */
export function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4" fill="currentColor">
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  );
}

/** Options over the whole screen, as on Collections; a tap outside or Escape closes it. */
export function Sheet({ title, onClose, children, role = "menu" }: { title: string; onClose: () => void; children: React.ReactNode; /** "dialog" when it holds a form. */ role?: "menu" | "dialog" }) {
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
        role={role}
        aria-modal={role === "dialog" || undefined}
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

/** A project's name, in a small form (new or rename). */
function NameForm({ initial = "", label, bare = false, onSave, onCancel }: { initial?: string; label: string; /** Inside a sheet: no card of its own. */ bare?: boolean; onSave: (name: string) => Promise<string | null>; onCancel: () => void }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <form method="post"
      className={`flex w-full flex-wrap items-end gap-3 ${bare ? "" : `${CARD} p-3`}`}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setError((await onSave(name)) ?? ""));
      }}
    >
      <label className="block min-w-0 flex-1 basis-60 space-y-1.5">
        <span className="text-[11.5px] text-mute">Project name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input max-sm:text-base" placeholder="e.g. Summer EP" autoFocus required maxLength={60} />
      </label>
      <button className={LIME} disabled={pending}>
        {pending ? "Saving…" : label}
      </button>
      <button type="button" className={GHOST_TALL} onClick={onCancel} disabled={pending}>
        Cancel
      </button>
      <FormError className="basis-full">{error}</FormError>
    </form>
  );
}

/** New project: a button on phones, a dashed tile in the grid from md (as New collection). */
export function NewProject() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <div className="order-first col-span-full md:order-none">
        <NameForm
          label="Create"
          onCancel={() => setOpen(false)}
          onSave={async (name) => {
            const r = await createProject(name);
            if (!r.ok) return r.error;
            setOpen(false);
            router.push(`/dashboard/projects/${r.id}`);
            return null;
          }}
        />
      </div>
    );
  return (
    <>
      <button onClick={() => setOpen(true)} className={`${LIME} order-first w-full gap-1.5 md:hidden`}>
        <Icon name="plus" className="size-4" />
        New project
      </button>
      <button
        onClick={() => setOpen(true)}
        className="hidden min-h-[132px] flex-col items-center justify-center gap-1.5 rounded-[18px] border border-dashed border-line-2 p-3 text-center transition-colors hover:bg-well md:flex"
      >
        <IconBox name="plus" small />
        <span className="text-[13px] font-semibold text-bone">New project</span>
        <span className="text-[11.5px] text-mute">A folder for your own tracks</span>
      </button>
    </>
  );
}

/** Rename and delete for one project, from its ··· button. */
function ProjectOptions({ p, onClose, onRename, onMove, onCover, onRemoveCover, showOpen }: { p: ProjectView; onClose: () => void; onRename: () => void; /** Move to folder, on a card in the list. */ onMove?: () => void; /** Opens the image picker (it lives outside this menu). */ onCover: () => void; onRemoveCover: () => void; showOpen: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [ask, confirmDialog] = useConfirm();
  // The confirm lives in this component, so the menu hides while it asks and closes only after the answer: closing
  // first unmounted the confirm, and Delete project did nothing.
  const [asking, setAsking] = useState(false);
  const remove = async () => {
    setAsking(true);
    const ok = await ask({ title: `Delete ${p.name}?`, body: "The project goes; its tracks stay in Projects, outside any project.", confirmLabel: "Delete project", danger: true });
    onClose();
    if (!ok) return;
    const r = await deleteProject(p.id);
    if (!r.ok) return toast.show({ message: r.error, tone: "error" });
    toast.show({ message: `Deleted ${p.name}` });
    router.push("/dashboard/collections?tab=projects");
  };
  return (
    <>
      {!asking && (
        <Sheet title={p.name} onClose={onClose}>
          {showOpen && (
          <Link role="menuitem" href={`/dashboard/projects/${p.id}`}>
            Open project
          </Link>
        )}
        <button role="menuitem" onClick={() => (onClose(), onRename())}>
          Rename project
        </button>
        <button role="menuitem" onClick={() => (onCover(), onClose())}>
          Change cover
        </button>
        {p.art && (
          <button role="menuitem" onClick={() => (onClose(), onRemoveCover())}>
            Remove cover
          </button>
        )}
        {onMove && (
          <button role="menuitem" onClick={() => (onClose(), onMove())}>
            Move to folder
          </button>
        )}
        <button role="menuitem" className="text-danger" onClick={remove}>
          Delete project
        </button>
        <button role="menuitem" className="text-center! text-mute" onClick={onClose}>
          Cancel
        </button>
        </Sheet>
      )}
      {confirmDialog}
    </>
  );
}

/** The ··· button and what it opens (rename in a sheet of its own); `showOpen` in the list (the page is already the project). */
function ProjectMenu({ p, showOpen, onMove }: { p: ProjectView; showOpen: boolean; onMove?: () => void }) {
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const cover = useCoverChoice("project", p.id, p.name);
  return (
    <>
      <button onClick={() => setMenu(true)} aria-haspopup="menu" aria-label={`More for ${p.name}`} className={ROUND} disabled={cover.busy}>
        <MoreDots />
      </button>
      {cover.picker}
      {menu && <ProjectOptions p={p} showOpen={showOpen} onClose={() => setMenu(false)} onRename={() => setRenaming(true)} onMove={onMove} onCover={cover.choose} onRemoveCover={cover.remove} />}
      {renaming && (
        <Sheet title={`Rename ${p.name}`} onClose={() => setRenaming(false)} role="dialog">
          <div className="hover:bg-transparent!">
            <NameForm
              initial={p.name}
              label="Save"
              bare
              onCancel={() => setRenaming(false)}
              onSave={async (name) => {
                const r = await renameProject(p.id, name);
                if (!r.ok) return r.error;
                setRenaming(false);
                router.refresh();
                return null;
              }}
            />
          </div>
        </Sheet>
      )}
    </>
  );
}

/** One project as a folder in the list: its own cover, else the plain music tile (project tracks carry no artwork yet), its name and its tracks. The whole row opens it. */
export function ProjectTile({ p, canEdit, folders, folderId = null, tile = false }: { p: ProjectView; canEdit: boolean; /** The desk's project folders, for Move to folder. */ folders?: { id: number; name: string }[]; folderId?: number | null; /** A tile on phones too (Projects, option 63 A). */ tile?: boolean }) {
  const [moving, setMoving] = useState(false);
  return (
    <FolderRow
      href={`/dashboard/projects/${p.id}`}
      name={p.name}
      spoken={`Open ${p.name}, project, ${trackCount(p.count)}`}
      covers={p.art ? [p.art] : []}
      empty={p.count === 0 && !p.art}
      line={`Project · ${trackCount(p.count)}`}
      tile={tile}
      menu={canEdit && <ProjectMenu p={p} showOpen onMove={folders ? () => setMoving(true) : undefined} />}
    >
      {moving && folders && <MoveToFolder kind="project" itemId={p.id} itemName={p.name} current={folderId} folders={folders} onClose={() => setMoving(false)} />}
    </FolderRow>
  );
}

/** The tools on a project's page: ··· with rename and delete. */
export function ProjectTools({ p }: { p: ProjectView }) {
  return <ProjectMenu p={p} showOpen={false} />;
}
