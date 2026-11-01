"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { Area } from "@/lib/ops-waiting";
import { setContactHandled } from "../actions";
import { Icon } from "../AdminNav";
import { useShortcuts } from "../kit/Keys";
import { OpsForm } from "../OpsForm";
import type { Row } from "./data";
import { AREA_TABS, areaCounts, fold, FOLD_AT, inArea, KIND_ROW, type AreaFilter } from "./model";

const rowId = (r: Row) => `wait-${r.kind}-${r.id}`;
const ACTION = "admin-press inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-4 text-[13px] font-semibold";

/**
 * Waiting on me (admin redesign B, step 3): every item waiting for this person, due soonest first, with an area filter,
 * a fold after six and keys (j/k move, Enter opens; listed under "?"). Each row has one action: the page that handles
 * it, or, for an inbox message, "Mark handled" in place (the Inbox's own server action).
 */
export function WaitingList({ rows, areas, oldestId, lastHandled, capped }: { rows: Row[]; areas: Area[]; oldestId: string | null; lastHandled: { what: string; ago: string } | null; capped: number }) {
  const router = useRouter();
  const [filter, setFilter] = useState<AreaFilter>("all");
  const [open, setOpen] = useState(false);
  const [focus, setFocus] = useState(-1);
  const pendingFocus = useRef<number | null>(null);
  const counts = areaCounts(rows, areas);
  const list = inArea(rows, filter);
  const { shown, hidden } = fold(list, open);

  // j/k move focus row by row; reaching the fold opens it.
  const move = (d: 1 | -1) => {
    if (!list.length) return;
    const next = focus < 0 ? 0 : Math.min(list.length - 1, Math.max(0, focus + d));
    if (next >= shown.length) setOpen(true);
    pendingFocus.current = next;
    setFocus(next);
  };
  useEffect(() => {
    if (pendingFocus.current == null) return;
    const r = list[pendingFocus.current];
    pendingFocus.current = null;
    if (r) document.getElementById(rowId(r))?.focus();
  });
  useShortcuts({
    j: { label: "Next waiting item", run: () => move(1) },
    k: { label: "Previous waiting item", run: () => move(-1) },
    // Listed under "?" only: Enter is handled on the focused row itself (below), so it never takes Enter from a button
    // or link elsewhere. The key manager names keys in lower case, so "Enter" here never fires.
    Enter: { label: "Open the selected waiting item", run: () => {} },
  });

  const pick = (f: AreaFilter) => {
    setFilter(f);
    setFocus(-1);
    setOpen(false);
  };

  return (
    <section aria-labelledby="waiting-h" className="admin-panel admin-rise min-w-0" style={{ "--i": 2 } as React.CSSProperties}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pb-2 pt-4 sm:px-5">
        <h2 id="waiting-h" className="text-[16px] font-semibold">
          Waiting on me <span className="ml-1 text-[13px] font-normal text-faint tnum">{rows.length}</span>
        </h2>
        {areas.length > 1 && rows.length > 0 && (
          <div role="group" aria-label="Filter waiting items by area" className="flex flex-wrap gap-1 sm:ml-auto">
            {[{ id: "all" as const, label: "All" }, ...AREA_TABS.filter((t) => areas.includes(t.id))].map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={filter === t.id}
                onClick={() => pick(t.id)}
                className={`admin-press inline-flex min-h-11 items-center gap-1.5 rounded-[11px] px-3 text-[13px] ${filter === t.id ? "bg-ink-4 font-semibold text-bone" : "text-mute hover:bg-ink-3 hover:text-bone"}`}
              >
                {t.label}
                <span className="text-[12px] text-faint tnum">{counts[t.id] ?? 0}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length ? (
        <ul className="px-2 pb-2 sm:px-3" aria-label={filter === "all" ? "Waiting items" : `Waiting items in ${AREA_TABS.find((a) => a.id === filter)?.label}`}>
          {shown.map((r, i) => (
            <WaitingRow key={rowId(r)} r={r} on={i === focus} oldest={oldestId === `${r.kind}-${r.id}`} onFocus={() => setFocus(i)} onOpen={() => router.push(r.href)} />
          ))}
        </ul>
      ) : (
        <p className="px-5 pb-6 pt-2 text-[14px] text-mute">
          {rows.length
            ? `Nothing waiting in ${AREA_TABS.find((a) => a.id === filter)?.label}.`
            : lastHandled
              ? `Last handled: ${lastHandled.what}, ${lastHandled.ago} ago. New items land here.`
              : "New items land here as they come in."}
        </p>
      )}
      {list.length > FOLD_AT && (
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-11 w-full items-center gap-2 border-t border-line px-5 text-[13px] text-mute hover:text-bone">
          <span aria-hidden className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}>
            ▾
          </span>
          {open ? "Show less" : `Show ${hidden} more`}
        </button>
      )}
      {capped > 0 && <p className="border-t border-line px-5 py-2.5 text-[12.5px] text-faint">The first {rows.length} of {capped}, soonest due first. The rest are on each page.</p>}
      {rows.length > 0 && (
      <p aria-hidden className="hidden flex-wrap gap-x-4 gap-y-1 border-t border-line px-5 py-2.5 text-[12px] text-faint md:flex">
        <span>
          <kbd className="kit-kbd">j</kbd> <kbd className="kit-kbd">k</kbd> move
        </span>
        <span>
          <kbd className="kit-kbd">Enter</kbd> open
        </span>
        <span>
          <kbd className="kit-kbd">?</kbd> all keys
        </span>
      </p>
      )}
    </section>
  );
}

function WaitingRow({ r, on, oldest, onFocus, onOpen }: { r: Row; on: boolean; oldest: boolean; onFocus: () => void; onOpen: () => void }) {
  const k = KIND_ROW[r.kind];
  const when = <span className={r.late ? "font-semibold text-[var(--admin-amber)]" : "text-faint"}>{r.when}</span>;
  return (
    <li
      id={rowId(r)}
      tabIndex={-1}
      onFocus={(e) => e.target === e.currentTarget && onFocus()}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.target !== e.currentTarget) return;
        e.preventDefault();
        onOpen();
      }}
      data-on={on || undefined}
      className="grid min-h-14 grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-x-3 rounded-[14px] px-2 py-2 outline-none hover:bg-ink-3 focus-visible:bg-ink-4 focus-visible:ring-2 focus-visible:ring-lime data-on:bg-ink-3 sm:grid-cols-[36px_minmax(0,1fr)_96px_auto]"
    >
      <span aria-hidden className="grid size-9 place-items-center rounded-[11px] bg-ink-4 text-mute">
        <Icon name={k.icon} className="size-[17px]" />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[14px] font-semibold">
          {r.kind === "inbox" ? (
            <Link href={r.href} className="hover:underline">
              {r.title}
            </Link>
          ) : (
            r.title
          )}
          {oldest && <span className="ml-2 text-[11.5px] font-semibold text-mute">Oldest</span>}
        </span>
        <span className="block truncate text-[12.5px] text-faint">
          {k.label} · {r.subtitle}
        </span>
        <span className="block text-[12.5px] tnum sm:hidden">{when}</span>
      </span>
      <span className="hidden text-right text-[12.5px] tnum sm:block">{when}</span>
      {r.kind === "inbox" ? (
        <OpsForm action={setContactHandled.bind(null, Number(r.id), true)}>
          <button className={`${ACTION} ${on ? "bg-lime text-ink" : "text-bone ring-1 ring-line-2 hover:bg-ink-4"}`}>
            {k.action}
            <span className="sr-only">: {r.title}</span>
          </button>
        </OpsForm>
      ) : (
        <Link href={r.href} className={`${ACTION} ${on ? "bg-lime text-ink" : "text-bone ring-1 ring-line-2 hover:bg-ink-4"}`}>
          {k.action}
          <span className="sr-only">: {r.title}</span>
        </Link>
      )}
    </li>
  );
}
