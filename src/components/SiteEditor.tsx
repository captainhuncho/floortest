"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { parseSizes, SIZE_CHOICES, sizesString, type SizeStep, type Sizes } from "@/lib/text-size";

/**
 * Editing a public page on the page itself (only for ops staff with Site content, while previewing drafts).
 * Text marked data-edit="field" becomes typeable; data-edit-panel="field" opens a small editor (lists, and wording
 * with fill-ins like {receiver}); data-edit-image="field" can be replaced or removed; sections can be dragged, moved or hidden.
 * Any text or list can be set Smaller, Default, Larger or Largest (the page's `sizes` field, see text-size.ts).
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

/** Smaller · Default · Larger · Largest, as pressable buttons (tap and keyboard). */
function SizePicker({ value, onPick, className = "" }: { value: SizeStep | ""; onPick: (s: SizeStep | "") => void; className?: string }) {
  return (
    <div role="group" aria-label="Text size" className={`flex flex-wrap gap-1 ${className}`}>
      {SIZE_CHOICES.map((c) => (
        <button
          key={c.label}
          type="button"
          aria-pressed={value === c.step}
          // Keeps the caret in the text when picking with a mouse or finger.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(c.step)}
          className={`min-h-11 rounded-md border px-3 text-xs font-bold ${value === c.step ? "border-lime bg-lime text-ink" : "border-line text-bone hover:border-mute"}`}
        >
          {c.label}
        </button>
      ))}
    </div>
  );
}

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
  const [sizes, setSizes] = useState<Sizes>(() => parseSizes(values.sizes));
  // The text whose size picker is showing, and where to draw it (under the text, kept on screen).
  const [picked, setPicked] = useState<{ field: string; el: HTMLElement } | null>(null);
  const [spot, setSpot] = useState<{ top: number; left: number } | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const imageField = useRef<string | null>(null);
  const count = Object.keys(changes).length;
  const set = useCallback((k: string, v: string) => setChanges((c) => ({ ...c, [k]: v })), []);

  /** Sets one field's size: shown at once on the page, saved with the draft. */
  const pickSize = useCallback(
    (field: string, step: SizeStep | "") => {
      setSizes((s) => {
        const next: Sizes = Object.fromEntries(Object.entries(s).filter(([k]) => k !== field));
        if (step) next[field] = step;
        set("sizes", sizesString(next));
        return next;
      });
      for (const el of document.querySelectorAll<HTMLElement>(`[data-edit="${CSS.escape(field)}"]`)) {
        if (step) el.dataset.ts = step;
        else delete el.dataset.ts;
      }
      for (const el of document.querySelectorAll<HTMLElement>(`[data-edit-panel="${CSS.escape(field)}"]`)) {
        if (step) el.dataset.tz = step;
        else delete el.dataset.tz;
      }
    },
    [set],
  );

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
    // Focusing a text (tap, click or Tab) shows its size picker; Escape in the text moves to the picker and back.
    const onFocus = (e: FocusEvent) => {
      const el = (e.target as HTMLElement).closest?.<HTMLElement>("[data-edit]");
      if (el && editing) setPicked({ field: el.dataset.edit!, el });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || !editing) return;
      const t = e.target as HTMLElement;
      if (t.closest?.("[data-edit]")) {
        e.preventDefault();
        pickerRef.current?.querySelector<HTMLButtonElement>("button[aria-pressed=true]")?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (!editing) return;
      const t = e.target as HTMLElement;
      if (t.closest("[data-site-editor-ui]")) return;
      if (!t.closest("[data-edit]")) setPicked(null);
      // A typeable text inside a list (e.g. a row's default line) stays typeable rather than opening the list's box.
      const box = t.closest("[data-edit]") ? null : t.closest<HTMLElement>("[data-edit-panel]");
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
    document.addEventListener("focusin", onFocus);
    document.addEventListener("keydown", onKey);
    document.addEventListener("click", onClick, true);
    document.body.classList.toggle("site-editing", editing);
    return () => {
      document.removeEventListener("input", onInput);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("click", onClick, true);
    };
  }, [editing, set, changes, values]);

  // The picker sits under the chosen text and follows it while the page scrolls or resizes.
  useEffect(() => {
    if (!picked) return;
    picked.el.classList.add("site-selected");
    const place = () => {
      const r = picked.el.getBoundingClientRect();
      const w = pickerRef.current?.offsetWidth ?? 320;
      const h = pickerRef.current?.offsetHeight ?? 56;
      const below = r.bottom + 8;
      const top = below + h > window.innerHeight - 96 ? Math.max(8, r.top - h - 8) : below;
      setSpot({ top, left: Math.min(Math.max(8, r.left), Math.max(8, window.innerWidth - w - 8)) });
    };
    // After the picker has drawn, so its size is known.
    const frame = requestAnimationFrame(place);
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      cancelAnimationFrame(frame);
      picked.el.classList.remove("site-selected");
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [picked]);

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
      {editing && picked && (
        <div
          ref={pickerRef}
          data-site-editor-ui
          className="keep-night fixed z-[105] max-w-[calc(100vw-16px)] rounded-lg border border-line bg-ink-2 p-1.5 text-bone shadow-pop"
          style={spot ? { top: spot.top, left: spot.left } : { visibility: "hidden", top: 0, left: 0 }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              picked.el.focus();
            }
          }}
        >
          <SizePicker value={sizes[picked.field] ?? ""} onPick={(s) => pickSize(picked.field, s)} />
        </div>
      )}
      <div data-site-editor-ui className="keep-night fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[100] mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-xl border border-line bg-ink-2 p-2.5 text-bone shadow-pop sm:inset-x-6">
        <span className="px-1 text-xs font-bold">
          Editing {label}
          <span className="ml-1.5 font-normal text-mute">{count ? `· ${count} unsaved change${count === 1 ? "" : "s"}` : "· draft"}</span>
        </span>
        <label className="ml-auto flex min-h-11 items-center gap-1.5 text-xs">
          <input type="checkbox" checked={editing} onChange={(e) => setEditing(e.target.checked)} className="size-4 accent-lime" />
          Edit mode
        </label>
        <button type="button" className="btn-ghost btn-sm" disabled={busy || !count} onClick={() => save(false)}>Save draft</button>
        <button type="button" className="btn-lime btn-sm" disabled={busy} onClick={() => save(true)}>Publish</button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a route handler that ends draft mode, so a full navigation */}
        <a href="/api/draft-preview?off" className="btn-ghost btn-sm" onClick={(e) => { if (count && !confirm("Leave without saving your changes?")) e.preventDefault(); }}>Exit</a>
        {status && <p role="status" className="w-full px-1 text-xs text-mute">{status}</p>}
      </div>
      {panel && (
        <div data-site-editor-ui className="keep-night fixed inset-0 z-[110] grid place-items-center bg-black/70 p-4" onClick={() => setPanel(null)}>
          <div role="dialog" aria-modal="true" aria-label="Edit this text" className="max-h-[calc(100dvh-2rem)] w-full max-w-xl overflow-y-auto rounded-xl border border-line bg-ink-2 p-5 text-bone" onClick={(e) => e.stopPropagation()}>
            <p className="font-bold">Edit this text</p>
            <p className="mt-1 text-xs text-mute">{panel.hint ?? "Each item: a title line, then its text. Leave a blank line between items."}</p>
            <textarea value={panel.text} onChange={(e) => setPanel({ ...panel, text: e.target.value })} rows={14} className="input mt-3 w-full font-mono text-xs" />
            <p className="mt-3 text-xs font-bold">Size</p>
            <SizePicker className="mt-1.5" value={sizes[panel.field] ?? ""} onPick={(s) => pickSize(panel.field, s)} />
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

/**
 * One movable section. In edit mode a bar sits above it, always visible on every screen (no hover needed): drag
 * handle, Move up, Move down, Hide or Show. Buttons are 44px for touch; Move up and Move down are the keyboard way.
 */
export function SectionFrame({ id, children }: { id: string; children: React.ReactNode }) {
  const ctx = useContext(EditorCtx);
  if (!ctx) return <>{children}</>;
  const i = ctx.order.findIndex((x) => x.id === id);
  const item = ctx.order[i];
  const hidden = !!item?.hidden;
  const name = ctx.labels[id] ?? id;
  return (
    <div
      style={{ order: i }}
      className={`relative ${ctx.editing ? "outline-dashed outline-1 -outline-offset-4 outline-lime/30 focus-within:outline-lime/70 hover:outline-lime/60" : ""} ${hidden && !ctx.editing ? "hidden" : ""} ${ctx.dragging === id ? "opacity-30" : ""}`}
      onDragOver={(e) => ctx.dragging && e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        if (ctx.dragging) ctx.move(ctx.dragging, i);
        ctx.setDragging(null);
      }}
    >
      {ctx.editing && (
        <div data-site-editor-ui className="keep-night mx-auto flex max-w-6xl justify-end px-4 pt-3 sm:px-6">
          <div role="group" aria-label={`Section: ${name}`} className="flex flex-wrap items-center gap-1 rounded-lg border border-line bg-ink-2 p-1 text-bone shadow-pop">
            <span
              draggable
              onDragStart={() => ctx.setDragging(id)}
              onDragEnd={() => ctx.setDragging(null)}
              title="Drag to move"
              aria-hidden
              className="grid min-h-11 min-w-11 cursor-grab place-items-center text-base text-mute active:cursor-grabbing"
            >
              ⠿
            </span>
            <span className="px-1 text-[11px] font-bold">{name}{hidden ? " · hidden" : ""}</span>
            <button type="button" className="btn-ghost min-h-11 min-w-11 px-2! text-sm" aria-label={`Move ${name} up`} disabled={i <= 0} onClick={() => ctx.move(id, i - 1)}>↑</button>
            <button type="button" className="btn-ghost min-h-11 min-w-11 px-2! text-sm" aria-label={`Move ${name} down`} disabled={i >= ctx.order.length - 1} onClick={() => ctx.move(id, i + 1)}>↓</button>
            <button type="button" className="btn-ghost min-h-11 px-3! text-xs" aria-pressed={hidden} onClick={() => ctx.toggle(id)}>{hidden ? "Show" : "Hide"}</button>
          </div>
        </div>
      )}
      <div className={hidden ? "opacity-40" : ""}>{children}</div>
    </div>
  );
}
