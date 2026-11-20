"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { ConfirmDialog, Dialog } from "@/components/Dialog";
import { Icon, type IconName } from "@/components/Kit";
import { useToast } from "@/components/Toast";
import type { ReportState } from "../actions/report";
import { ReportTrack } from "../ReportTrack";
import { useReviewInfo } from "./ReviewInfo";

/** Brings a part of the page lower down into view without a slide when motion is reduced. */
function reveal(el: Element) {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
}

/**
 * Goes to a control of the open track, looked up inside that track's own card and never across the page. A team desk's
 * Review together fold opens first when the control is inside it. An opener (marked data-more) is pressed, so its form opens with the cursor in
 * it; anything else takes focus.
 */
function goTo(card: ParentNode, selector: string) {
  const details = card.querySelector<HTMLDetailsElement>("details[data-panel-team]");
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

/** A layer More opens over the page: nothing on the card itself moves, reports or deletes a track. */
type Panel = "move" | "project" | "report" | "delete";

/**
 * `to`: the control on the open track's card this item goes to. `run`: what it does itself (Reply, Download, Copy
 * link, a layer). `rule`: a divider sits above it.
 */
type Item = { label: string; icon: IconName; to?: string; run?: () => void; danger?: boolean; rule?: boolean };

/** What Report needs: the bound action, the sender's name for the block box, and whether this person may block. */
export type ReportProps = { action: (state: ReportState, form: FormData) => Promise<ReportState>; senderName: string; canBlock: boolean };

const CALL = "inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[13px] border border-line bg-well px-3.5 text-[13px] font-semibold text-bone transition-colors hover:border-line-2";
const ITEM = "flex min-h-12 w-full items-center gap-3 rounded-[10px] px-3 text-left text-[14px] font-medium text-bone hover:bg-well focus-visible:bg-well md:min-h-11 md:text-[13px]";

function Items({ items, role, onPick }: { items: Item[]; role?: "menuitem"; onPick: (item: Item) => void }) {
  return items.map((item) => (
    <Fragment key={item.label}>
      {item.rule && <div role="separator" className="mx-2 my-1 border-t border-line" />}
      <button type="button" role={role} tabIndex={role ? -1 : undefined} onClick={() => onPick(item)} className={ITEM}>
        <Icon name={item.icon} className={`size-[18px] shrink-0 ${item.danger ? "text-danger" : "text-mute"}`} />
        <span className={item.danger ? "text-danger" : undefined}>{item.label}</span>
      </button>
    </Fragment>
  ));
}

/**
 * More, beside the decision (Design option 42): a sheet on phones, a pop-over beside the button on laptops. An item
 * goes to something the page already shows (Played out, the team's Review together), opens Info on the sender's
 * private note, or opens its own layer: Move to callout, Move to a project (the desk's own uploads only), Report and,
 * last and in red under a divider, Delete (review card option 1; owner, 20 Nov). An item whose control isn't there (a
 * track that isn't kept has no Played out; a Member can't delete) is left out. Copy link copies this track's own
 * Queue address. Escape or a click outside closes it, and focus goes back to the button. The pop-over is a
 * menu for the keyboard too: it opens on its first item, the arrow keys, Home and End move through the items, and Tab
 * closes it.
 */
export function MoreMenu({
  trackId,
  href,
  onReply,
  download,
  move,
  project,
  report,
  onDelete,
}: {
  trackId: number;
  href: string;
  onReply?: () => void;
  download?: string;
  /** The Move to callout form, shown in its own layer. */
  move?: React.ReactNode;
  /** The Move to a project control: only on a track the desk added itself. */
  project?: React.ReactNode;
  report?: ReportProps;
  /** Deletes the file and goes on. Left out for people who can't delete. */
  onDelete?: () => Promise<void>;
}) {
  const info = useReviewInfo();
  const [panel, setPanel] = useState<Panel | null>(null);
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
    // The pop-over's item has gone with it: put focus back on More first, so a layer opened next (Reply) hands it back there.
    if (was.current !== "sheet" || !el) {
      button.current?.focus({ preventScroll: true });
      return run();
    }
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
    ...(info ? [{ label: "Add a note", icon: "tag" as const, run: () => info.show("sender", "[data-more=note], #note-body") }] : []),
    { label: "Played out", icon: "head", to: "[data-more=played], [data-played-out]" },
    { label: "Shortlist", icon: "star", to: "[data-more=shortlist]" },
    { label: "Comment for the team", icon: "mail", to: `#comment-${trackId}` },
    ...(move ? [{ label: "Move to callout…", icon: "folder" as const, run: () => setPanel("move") }] : []),
    ...(project ? [{ label: "Move to a project…", icon: "music" as const, run: () => setPanel("project") }] : []),
    { label: "Copy link", icon: "link", run: () => void copy() },
    ...(report ? [{ label: "Report", icon: "shield" as const, run: () => setPanel("report") }] : []),
    ...(onDelete ? [{ label: "Delete", icon: "x" as const, run: () => setPanel("delete"), danger: true }] : []),
  ];
  // Report and Delete sit last, under one divider.
  const ruleAt = all.findIndex((item) => item.label === "Report" || item.label === "Delete");
  /** The open track's card: the only place the menu looks for a control. */
  const card = () => wrap.current?.closest("#review-card") ?? null;
  const toggle = () => {
    if (open) return setOpen(null);
    const here = card();
    setItems(all.map((item, i) => (i === ruleAt ? { ...item, rule: true } : item)).filter((item) => !item.to || here?.querySelector(item.to)));
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
      {move && (
        <Dialog open={panel === "move"} onClose={() => setPanel(null)} title="Move to callout">
          {/* The form sends itself; the layer closes behind it. */}
          <div onSubmit={() => setTimeout(() => setPanel(null))}>{move}</div>
        </Dialog>
      )}
      {project && (
        <Dialog open={panel === "project"} onClose={() => setPanel(null)} title="Move to a project">
          {project}
        </Dialog>
      )}
      {report && (
        <Dialog open={panel === "report"} onClose={() => setPanel(null)} title="Report">
          {panel === "report" && <ReportTrack {...report} startOpen onCancel={() => setPanel(null)} />}
        </Dialog>
      )}
      {onDelete && (
        <ConfirmDialog
          open={panel === "delete"}
          onClose={() => setPanel(null)}
          onConfirm={onDelete}
          title="Delete this file now?"
          body="It's removed for good and its slot comes back. The sender's history stays on this desk."
          confirmLabel="Delete file"
          danger
        />
      )}
    </div>
  );
}
