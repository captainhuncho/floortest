"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CARD, Cover, Icon, IconBox, initials } from "@/components/Kit";
import { useConfirm } from "@/components/Dialog";
import { FormError } from "@/components/Feedback";
import { useFocusTrap } from "@/components/useFocusTrap";
import { useToast } from "@/components/Toast";
import { fmtTime } from "@/lib/format";
import { createProject, deleteProject, renameProject } from "../actions/music";
import { GHOST, GHOST_TALL, LIME } from "../kitButtons";

export type ProjectView = { id: number; name: string; count: number; duration: number };

/** Total length as "1 h 04 min" or "12 min" (a track's own length stays m:ss). */
export function fmtLength(sec: number) {
  if (!sec) return "0 min";
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : m ? `${m} min` : fmtTime(sec);
}

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
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
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

/** A project's name, in a small form (new or rename). */
function NameForm({ initial = "", label, onSave, onCancel }: { initial?: string; label: string; onSave: (name: string) => Promise<string | null>; onCancel: () => void }) {
  const [name, setName] = useState(initial);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  return (
    <form
      className={`flex w-full flex-wrap items-end gap-3 ${CARD} p-3`}
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => setError((await onSave(name)) ?? ""));
      }}
    >
      <label className="block min-w-0 flex-1 basis-60 space-y-1.5">
        <span className="text-[11.5px] text-mute">Project name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="e.g. Summer EP" autoFocus required maxLength={60} />
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
function ProjectOptions({ p, onClose, onRename, showOpen }: { p: ProjectView; onClose: () => void; onRename: () => void; showOpen: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const [ask, confirmDialog] = useConfirm();
  const remove = async () => {
    onClose();
    const ok = await ask({ title: `Delete ${p.name}?`, body: "The project goes; its tracks stay in Projects, outside any project.", confirmLabel: "Delete project", danger: true });
    if (!ok) return;
    const r = await deleteProject(p.id);
    if (!r.ok) return toast.show({ message: r.error, tone: "error" });
    toast.show({ message: `Deleted ${p.name}` });
    router.push("/dashboard/projects");
  };
  return (
    <>
      <Sheet title={p.name} onClose={onClose}>
        {showOpen && (
          <Link role="menuitem" href={`/dashboard/projects/${p.id}`}>
            Open project
          </Link>
        )}
        <button role="menuitem" onClick={() => (onClose(), onRename())}>
          Rename project
        </button>
        <button role="menuitem" className="text-danger" onClick={remove}>
          Delete project
        </button>
        <button role="menuitem" className="text-center! text-mute" onClick={onClose}>
          Cancel
        </button>
      </Sheet>
      {confirmDialog}
    </>
  );
}

/** The ··· button and what it opens; `showOpen` on a card (the page head is already the project). */
function ProjectMenu({ p, showOpen, onRename }: { p: ProjectView; showOpen: boolean; onRename: () => void }) {
  const [menu, setMenu] = useState(false);
  return (
    <>
      <button
        onClick={() => setMenu(true)}
        aria-haspopup="menu"
        aria-label={`More for ${p.name}`}
        className="relative z-10 grid size-11 shrink-0 place-items-center rounded-[12px] border border-line bg-well text-mute hover:text-bone"
      >
        <MoreIcon />
      </button>
      {menu && <ProjectOptions p={p} showOpen={showOpen} onClose={() => setMenu(false)} onRename={onRename} />}
    </>
  );
}

function RenameProject({ p, onDone }: { p: ProjectView; onDone: () => void }) {
  const router = useRouter();
  return (
    <NameForm
      initial={p.name}
      label="Save"
      onCancel={onDone}
      onSave={async (name) => {
        const r = await renameProject(p.id, name);
        if (!r.ok) return r.error;
        onDone();
        router.refresh();
        return null;
      }}
    />
  );
}

/** One project as a card (as a collection's): cover, name, its tracks and length. The whole card opens it. */
export function ProjectTile({ p, canEdit }: { p: ProjectView; canEdit: boolean }) {
  const [renaming, setRenaming] = useState(false);
  if (renaming) return <RenameProject p={p} onDone={() => setRenaming(false)} />;
  return (
    <div className={`relative flex flex-col gap-2.5 ${CARD} p-3`}>
      <div className="flex items-start gap-2.5">
        <Cover text={initials(p.name)} />
        <div className="min-w-0 flex-1">
          <Link href={`/dashboard/projects/${p.id}`} className="block truncate text-[15px] font-semibold tracking-[-0.015em] text-bone after:absolute after:inset-0 after:rounded-[18px]">
            {p.name}
          </Link>
          <p className="mt-1 text-[11.5px] text-mute">Project</p>
        </div>
        {canEdit && <ProjectMenu p={p} showOpen onRename={() => setRenaming(true)} />}
      </div>
      <dl className="grid grid-cols-2 text-center">
        <div className="flex flex-col">
          <dt className="text-[11.5px] text-mute">Tracks</dt>
          <dd className="text-[16px] font-semibold leading-tight text-bone tnum">{p.count}</dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-[11.5px] text-mute">Length</dt>
          <dd className="text-[16px] font-semibold leading-tight text-bone tnum">{fmtLength(p.duration)}</dd>
        </div>
      </dl>
    </div>
  );
}

/** A project page's head: back to Projects, cover, name, its tracks and length, and ··· options. */
export function ProjectHeader({ p, canEdit }: { p: ProjectView; canEdit: boolean }) {
  const [renaming, setRenaming] = useState(false);
  return (
    <header className="flex flex-col gap-3">
      <Link href="/dashboard/projects" className={`${GHOST} self-start`}>
        <Icon name="chev" className="size-3.5 rotate-180" />
        Projects
      </Link>
      {renaming ? (
        <RenameProject p={p} onDone={() => setRenaming(false)} />
      ) : (
        <div className="flex items-center gap-3">
          <Cover text={initials(p.name)} size="size-[52px]" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-[22px] font-semibold leading-tight tracking-[-0.025em] text-bone">{p.name}</h1>
            <p className="mt-0.5 text-[12px] text-mute tnum">
              {p.count} {p.count === 1 ? "track" : "tracks"} · {fmtLength(p.duration)}
            </p>
          </div>
          {canEdit && <ProjectMenu p={p} showOpen={false} onRename={() => setRenaming(true)} />}
        </div>
      )}
    </header>
  );
}
