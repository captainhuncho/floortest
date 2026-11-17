"use client";

import { useEffect, useRef, useState } from "react";
import { Dialog } from "@/components/Dialog";
import { Icon, type IconName } from "@/components/Kit";
import { useToast } from "@/components/Toast";

/** Brings a part of the page lower down into view without a slide when motion is reduced. */
function reveal(el: Element) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
}

/**
 * Goes to a control that already lives on the page. Details opens first when the control is inside it. An opener
 * (marked data-more) is pressed, so its form opens with the cursor in it; anything else takes focus.
 */
function goTo(selector: string) {
  const details = document.querySelector<HTMLDetailsElement>("details[data-panel-details]");
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  if (details?.contains(el)) details.open = true;
  reveal(el);
  if (!el.dataset.more) return el.focus({ preventScroll: true });
  // The opener gives way to its form: the cursor goes to the form's first field.
  const around = el.parentElement;
  el.click();
  requestAnimationFrame(() => around?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true }));
}

type Item = { label: string; icon: IconName; run: () => void };

const CALL = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[13px] border border-line bg-well px-3.5 text-[13px] font-semibold text-bone transition-colors hover:border-line-2";
const ITEM = "flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[14px] font-medium text-bone hover:bg-well focus-visible:bg-well md:min-h-11 md:text-[13px]";

function Items({ items, role, onPick }: { items: Item[]; role?: "menuitem"; onPick: (item: Item) => void }) {
  return items.map((item) => (
    <button key={item.label} type="button" role={role} onClick={() => onPick(item)} className={ITEM}>
      <Icon name={item.icon} className="size-[18px] shrink-0 text-mute" />
      {item.label}
    </button>
  ));
}

/**
 * More, beside the decision (Design option 42): a sheet on phones, a pop-over beside the button on laptops. Every item
 * goes to something the page already has (the private note, Played out, Move, Details, Report); Copy link copies this
 * track's own Queue address. Escape or a click outside closes it, and focus goes back to the button.
 */
export function MoreMenu({ trackId, href, kept }: { trackId: number; href: string; kept: boolean }) {
  // "sheet" on phones, "pop" from 768px; decided when it opens.
  const [open, setOpen] = useState<"sheet" | "pop" | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // What to do once the layer has closed and focus is back on the button.
  const after = useRef<(() => void) | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (open) return;
    const run = after.current;
    after.current = null;
    run?.();
  }, [open]);

  useEffect(() => {
    if (open !== "pop") return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent) {
        if (e.key !== "Escape") return;
        setOpen(null);
        button.current?.focus();
      } else if (!wrap.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(new URL(href, window.location.origin).href);
      toast.show({ message: "Link copied. It opens this track for people on this desk." });
    } catch {
      toast.show({ message: "Couldn't copy the link. Copy it from the address bar.", tone: "error" });
    }
  };

  const items: Item[] = [
    { label: "Add a note", icon: "tag", run: () => goTo("[data-more=note], #note-body") },
    ...(kept ? [{ label: "Played out", icon: "head" as const, run: () => goTo("[data-more=played], [data-played-out]") }] : []),
    { label: "Move", icon: "folder", run: () => goTo(`#move-${trackId}`) },
    { label: "Copy link", icon: "link", run: () => void copy() },
    { label: "Details", icon: "music", run: () => goTo("details[data-panel-details] summary") },
    { label: "Report", icon: "shield", run: () => goTo("[data-more=report]") },
  ];
  const pick = (item: Item) => {
    after.current = item.run;
    setOpen(null);
  };
  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((o) => (o ? null : window.matchMedia("(min-width: 768px)").matches ? "pop" : "sheet"))}
        aria-expanded={open === "pop"}
        aria-haspopup={open === "sheet" ? "dialog" : "menu"}
        className={`${CALL} w-full`}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="19" cy="12" r="1.9" />
        </svg>
        More
      </button>
      {open === "pop" && (
        <div role="menu" aria-label="More" className="absolute left-0 top-full z-30 mt-1.5 w-56 rounded-[13px] border border-line bg-card p-1 shadow-pop">
          <Items items={items} role="menuitem" onPick={pick} />
        </div>
      )}
      <Dialog open={open === "sheet"} onClose={() => setOpen(null)} title="More">
        <div className="-mx-2 flex flex-col gap-0.5"><Items items={items} onPick={pick} /></div>
      </Dialog>
    </div>
  );
}
