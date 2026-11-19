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
 * Goes to a control of the open track, looked up inside that track's own card and never across the page. Details opens
 * first when the control is inside it. An opener (marked data-more) is pressed, so its form opens with the cursor in
 * it; anything else takes focus.
 */
function goTo(card: ParentNode, selector: string) {
  const details = card.querySelector<HTMLDetailsElement>("details[data-panel-details]");
  const el = card.querySelector<HTMLElement>(selector);
  if (!el) return;
  if (details?.contains(el)) details.open = true;
  reveal(el);
  if (!el.dataset.more) return el.focus({ preventScroll: true });
  // The opener gives way to its form: the cursor goes to the form's first field.
  const around = el.parentElement;
  el.click();
  requestAnimationFrame(() => around?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true }));
}

/** `to`: the control on the open track's card this item goes to. `run`: what it does itself (Reply, Download, Copy link). */
type Item = { label: string; icon: IconName; to?: string; run?: () => void; danger?: boolean };

const CALL = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[13px] border border-line bg-well px-3.5 text-[13px] font-semibold text-bone transition-colors hover:border-line-2";
const ITEM = "flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[14px] font-medium text-bone hover:bg-well focus-visible:bg-well md:min-h-11 md:text-[13px]";

function Items({ items, role, onPick }: { items: Item[]; role?: "menuitem"; onPick: (item: Item) => void }) {
  return items.map((item) => (
    <button key={item.label} type="button" role={role} tabIndex={role ? -1 : undefined} onClick={() => onPick(item)} className={ITEM}>
      <Icon name={item.icon} className={`size-[18px] shrink-0 ${item.danger ? "text-danger" : "text-mute"}`} />
      <span className={item.danger ? "text-danger" : undefined}>{item.label}</span>
    </button>
  ));
}

/**
 * More, beside the decision (Design option 42): a sheet on phones, a pop-over beside the button on laptops. Every item
 * goes to something the open track's card already shows (the private note, Played out, Move, Details, Report), and an
 * item whose control isn't on the card (a track that isn't kept has no Played out) is left out. Copy link copies this
 * track's own Queue address. Escape or a click outside closes it, and focus goes back to the button. The pop-over is a
 * menu for the keyboard too: it opens on its first item, the arrow keys, Home and End move through the items, and Tab
 * closes it.
 */
export function MoreMenu({ trackId, href, onReply, download }: { trackId: number; href: string; onReply?: () => void; download?: string }) {
  // "sheet" on phones, "pop" from 768px; decided when it opens.
  const [open, setOpen] = useState<"sheet" | "pop" | null>(null);
  // The items whose control is on the card, read when the menu opens.
  const [items, setItems] = useState<Item[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  // What to do once the layer has closed and focus is back on the button.
  const after = useRef<(() => void) | null>(null);
  // How it was last open, so closing knows whether a sheet is still on its way out.
  const was = useRef<"sheet" | "pop" | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (open) {
      was.current = open;
      return;
    }
    const run = after.current;
    after.current = null;
    if (!run) return;
    const el = wrap.current;
    if (was.current !== "sheet" || !el) return run();
    // The sheet's dialog hands focus back to the button when its close event fires, a moment after this. Go once that
    // has happened, or the button takes focus from the control just picked. The event doesn't bubble: catch it going down.
    el.addEventListener("close", () => setTimeout(run), { capture: true, once: true });
  }, [open]);

  useEffect(() => {
    if (open !== "pop") return;
    wrap.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
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

  // Compact card (owner, 19 Nov): only Keep and Not for me sit on the card; every other call is in here.
  const all: Item[] = [
    ...(onReply ? [{ label: "Reply", icon: "reply" as const, run: onReply }] : []),
    ...(download ? [{ label: "Download", icon: "dl" as const, run: () => window.location.assign(download) }] : []),
    { label: "Add a note", icon: "tag", to: "[data-more=note], #note-body" },
    { label: "Played out", icon: "head", to: "[data-more=played], [data-played-out]" },
    { label: "Shortlist", icon: "star", to: "[data-more=shortlist]" },
    { label: "Comment for the team", icon: "mail", to: `#comment-${trackId}` },
    { label: "Move", icon: "folder", to: `#move-${trackId}` },
    { label: "Copy link", icon: "link", run: () => void copy() },
    { label: "Details", icon: "music", to: "details[data-panel-details] summary" },
    { label: "Report", icon: "shield", to: "[data-more=report]" },
    { label: "Delete", icon: "x", to: "[data-more=delete]", danger: true },
  ];
  /** The open track's card: the only place the menu looks for a control. */
  const card = () => wrap.current?.closest("#review-card") ?? null;
  const toggle = () => {
    if (open) return setOpen(null);
    const here = card();
    setItems(all.filter((item) => !item.to || here?.querySelector(item.to)));
    setOpen(window.matchMedia("(min-width: 768px)").matches ? "pop" : "sheet");
  };
  const pick = (item: Item) => {
    after.current = () => {
      const here = card();
      if (item.run) item.run();
      else if (here && item.to) goTo(here, item.to);
    };
    setOpen(null);
  };
  /** The pop-over's own keys: arrows, Home and End move between the items; Tab closes it and moves on from the button. */
  const onMenuKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Tab") {
      setOpen(null);
      return button.current?.focus();
    }
    const list = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    const at = list.indexOf(document.activeElement as HTMLElement);
    const last = list.length - 1;
    const to = e.key === "ArrowDown" ? (at >= last ? 0 : at + 1) : e.key === "ArrowUp" ? (at <= 0 ? last : at - 1) : e.key === "Home" ? 0 : e.key === "End" ? last : -1;
    if (to < 0) return;
    e.preventDefault();
    list[to]?.focus();
  };
  return (
    <div ref={wrap} className="relative">
      <button
        ref={button}
        type="button"
        onClick={toggle}
        aria-expanded={open === "pop"}
        aria-haspopup={open === "sheet" ? "dialog" : "menu"}
        aria-label="More"
        className={`${CALL} min-h-13 w-13 rounded-[15px] px-0! md:min-h-11 md:w-11 md:rounded-[13px]`}
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
          <circle cx="5" cy="12" r="1.9" />
          <circle cx="12" cy="12" r="1.9" />
          <circle cx="19" cy="12" r="1.9" />
        </svg>
      </button>
      {open === "pop" && (
        <div role="menu" aria-label="More" onKeyDown={onMenuKey} className="absolute right-0 top-full z-30 mt-1.5 w-60 rounded-[13px] border border-line bg-card p-1 shadow-pop">
          <Items items={items} role="menuitem" onPick={pick} />
        </div>
      )}
      <Dialog open={open === "sheet"} onClose={() => setOpen(null)} title="More">
        <div className="-mx-2 flex flex-col gap-0.5"><Items items={items} onPick={pick} /></div>
      </Dialog>
    </div>
  );
}
