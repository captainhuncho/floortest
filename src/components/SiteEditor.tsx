"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Editing a public page on the page itself (only for ops staff with Site content, while previewing drafts).
 * Text marked data-edit="field" becomes typeable; data-edit-panel="field" opens a small editor (lists, and wording
 * with fill-ins like {receiver}); data-edit-image="field" can be replaced or removed; sections can be dragged, moved or hidden.
 * Everything saves into the draft; Publish puts it live. See docs/03-app-flow.md.
 */
type Order = { id: string; hidden: boolean }[];
type Ctx = {
  editing: boolean;
  order: Order;
  labels: Record<string, string>;
  move: (id: string, to: number) => void;
  toggle: (id: string) => void;
  dragging: string | null;
  setDragging: (id: string | null) => void;
};
const EditorCtx = createContext<Ctx | null>(null);

const orderString = (o: Order) => o.map((x) => `${x.hidden ? "-" : ""}${x.id}`).join(",");

export function SiteEditor({
  page,
  label,
  values,
  initialOrder,
  labels = {},
  children,
}: {
  page: string;
  label: string;
  /** The draft as it stands, for fields edited in a panel (lists). */
  values: Record<string, string>;
  initialOrder?: Order;
  labels?: Record<string, string>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(true);
  const [changes, setChanges] = useState<Record<string, string>>({});
  const [order, setOrder] = useState<Order>(initialOrder ?? []);
  const [dragging, setDragging] = useState<string | null>(null);
  const [panel, setPanel] = useState<{ field: string; text: string; hint?: string } | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const imageField = useRef<string | null>(null);
  const count = Object.keys(changes).length;
  const set = useCallback((k: string, v: string) => setChanges((c) => ({ ...c, [k]: v })), []);

  // Typeable text, list panels, image buttons; links don't navigate while editing.
  useEffect(() => {
    const texts = Array.from(document.querySelectorAll<HTMLElement>("[data-edit]"));
    for (const el of texts) {
      el.contentEditable = editing ? "plaintext-only" : "false";
      el.classList.toggle("site-editable", editing);
    }
    const onInput = (e: Event) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>("[data-edit]");
      if (el) set(el.dataset.edit!, el.innerText.trim());
    };
    const onClick = (e: MouseEvent) => {
      if (!editing) return;
      const t = e.target as HTMLElement;
      if (t.closest("[data-site-editor-ui]")) return;
      const box = t.closest<HTMLElement>("[data-edit-panel]");
      if (box) {
        e.preventDefault();
        const f = box.dataset.editPanel!;
        setPanel({ field: f, text: changes[f] ?? values[f] ?? "", hint: box.dataset.editHint });
        return;
      }
      const img = t.closest<HTMLElement>("[data-edit-image]");
      if (img) {
        e.preventDefault();
        imageField.current = img.dataset.editImage!;
        imageInput.current?.click();
        return;
      }
      if (t.closest("a, summary") && !t.closest("[data-edit]")) e.preventDefault();
      if (t.closest("[data-edit]")) e.preventDefault();
    };
    document.addEventListener("input", onInput);
    document.addEventListener("click", onClick, true);
    document.body.classList.toggle("site-editing", editing);
    return () => {
      document.removeEventListener("input", onInput);
      document.removeEventListener("click", onClick, true);
    };
  }, [editing, set, changes, values]);

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (count) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [count]);

  const move = useCallback((id: string, to: number) => {
    setOrder((o) => {
      const from = o.findIndex((x) => x.id === id);
      if (from < 0 || to < 0 || to >= o.length || to === from) return o;
      const next = o.slice();
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      set("sections", orderString(next));
      return next;
    });
  }, [set]);
  const toggle = useCallback((id: string) => {
    setOrder((o) => {
      const next = o.map((x) => (x.id === id ? { ...x, hidden: !x.hidden } : x));
      set("sections", orderString(next));
      return next;
    });
  }, [set]);

  async function onImage(file: File | undefined) {
    const field = imageField.current;
    if (!file || !field) return;
    setBusy(true);
    setStatus("Uploading image…");
    const body = new FormData();
    body.append("file", file);
    const r = await fetch("/api/site-edit/image", { method: "POST", body }).then((x) => x.json()).catch(() => ({ error: "Upload failed." }));
    setBusy(false);
    if (!r.key) return setStatus(r.error || "Upload failed.");
    set(field, r.key);
    const img = document.querySelector<HTMLElement>(`[data-edit-image="${field}"] img`);
    if (img) (img as HTMLImageElement).src = URL.createObjectURL(file);
    setStatus("Image ready. Save to keep it.");
  }

  async function save(publish: boolean) {
    setBusy(true);
    setStatus(publish ? "Publishing…" : "Saving draft…");
    const r = await fetch("/api/site-edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page, values: changes, publish }),
    }).then((x) => x.json()).catch(() => ({ error: "Couldn't save. Check your connection." }));
    setBusy(false);
    if (!r.ok) return setStatus(r.error || "Couldn't save.");
    setChanges({});
    setStatus(publish ? "Published. It's live." : "Draft saved. Only you see it until you publish.");
    router.refresh();
  }

  const ctx = useMemo(() => ({ editing, order, labels, move, toggle, dragging, setDragging }), [editing, order, labels, move, toggle, dragging]);

  return (
    <EditorCtx.Provider value={ctx}>
      {children}
      <input ref={imageInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => { onImage(e.target.files?.[0]); e.target.value = ""; }} />
      <div data-site-editor-ui className="keep-night fixed inset-x-3 bottom-3 z-[100] mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-line bg-ink-2 p-2.5 text-bone shadow-pop sm:inset-x-6">
        <span className="px-1 text-xs font-bold">
          Editing {label}
          <span className="ml-1.5 font-normal text-mute">{count ? `· ${count} unsaved change${count === 1 ? "" : "s"}` : "· draft"}</span>
        </span>
        <label className="ml-auto flex items-center gap-1.5 text-xs">
          <input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} className="size-4 accent-lime" />
          Edit mode
        </label>
        <button type="button" className="btn-ghost btn-sm" disabled={busy || !count} onClick={() => save(false)}>Save draft</button>
        <button type="button" className="btn-lime btn-sm" disabled={busy} onClick={() => save(true)}>Publish</button>
        <a href="/api/draft-preview?off" className="btn-ghost btn-sm" onClick={(e) => { if (count && !confirm("Leave without saving your changes?")) e.preventDefault(); }}>Exit</a>
        {status && <p role="status" className="w-full px-1 text-xs text-mute">{status}</p>}
      </div>
      {panel && (
        <div data-site-editor-ui className="keep-night fixed inset-0 z-[110] grid place-items-center bg-black/70 p-4" onClick={() => setPanel(null)}>
          <div className="w-full max-w-xl rounded-xl border border-line bg-ink-2 p-5 text-bone" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold">Edit this text</p>
            <p className="mt-1 text-xs text-mute">{panel.hint ?? "Each item: a title line, then its text. Leave a blank line between items."}</p>
            <textarea value={panel.text} onChange={(e) => setPanel({ ...panel, text: e.target.value })} rows={14} className="input mt-3 w-full font-mono text-xs" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="btn-ghost btn-sm" onClick={() => setPanel(null)}>Cancel</button>
              <button type="button" className="btn-lime btn-sm" onClick={() => { set(panel.field, panel.text); setPanel(null); setStatus("Updated. Save to see it on the page."); }}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </EditorCtx.Provider>
  );
}

/** The sections' container: their on-screen order follows the editor's order. */
export function SectionList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col">{children}</div>;
}

/** One movable section: drag handle, up, down and hide, shown on hover in edit mode. */
export function SectionFrame({ id, children }: { id: string; children: React.ReactNode }) {
  const ctx = useContext(EditorCtx);
  if (!ctx) return <>{children}</>;
  const i = ctx.order.findIndex((x) => x.id === id);
  const item = ctx.order[i];
  const hidden = !!item?.hidden;
  return (
    <div
      style={{ order: i }}
      className={`group/sec relative ${ctx.editing ? "outline-dashed outline-1 -outline-offset-4 outline-transparent hover:outline-lime/60" : ""} ${hidden ? (ctx.editing ? "opacity-40" : "hidden") : ""} ${ctx.dragging === id ? "opacity-30" : ""}`}
      onDragOver={(e) => ctx.dragging && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (ctx.dragging) ctx.move(ctx.dragging, i);
        ctx.setDragging(null);
      }}
    >
      {ctx.editing && (
        <div data-site-editor-ui className="keep-night absolute right-3 top-3 z-30 flex items-center gap-1 rounded-lg border border-line bg-ink-2 p-1 text-bone opacity-100 shadow-pop sm:opacity-0 sm:group-hover/sec:opacity-100">
          <span
            draggable
            onDragStart={() => ctx.setDragging(id)}
            onDragEnd={() => ctx.setDragging(null)}
            title="Drag to move"
            className="cursor-grab px-2 text-sm text-mute active:cursor-grabbing"
          >
            ⠿
          </span>
          <span className="px-1 text-[11px] font-bold">{ctx.labels[id] ?? id}{hidden ? " · hidden" : ""}</span>
          <button type="button" className="btn-ghost btn-sm px-2!" aria-label="Move up" disabled={i <= 0} onClick={() => ctx.move(id, i - 1)}>↑</button>
          <button type="button" className="btn-ghost btn-sm px-2!" aria-label="Move down" disabled={i >= ctx.order.length - 1} onClick={() => ctx.move(id, i + 1)}>↓</button>
          <button type="button" className="btn-ghost btn-sm" onClick={() => ctx.toggle(id)}>{hidden ? "Show" : "Hide"}</button>
        </div>
      )}
      {children}
    </div>
  );
}
