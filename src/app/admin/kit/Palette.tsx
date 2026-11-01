"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useModalDialog } from "@/components/Dialog";
import type { PalettePerson } from "@/lib/ops-palette";
import { paletteSearch } from "../actions";
import { peopleQuery, rankCommands, type PaletteCommand } from "./core";
import { isDialogOpen } from "./live";
import { useKeysHelp } from "./Keys";

/** A page or an action in ⌘K. Pages carry `href`; actions are named by id and run here. */
export type PaletteEntry = PaletteCommand & { href?: string; group: "Pages" | "Actions" };
type Option = { kind: "person"; person: PalettePerson } | { kind: "command"; entry: PaletteEntry };

/** Other ops code can open the palette (a button in the coming top bar) by sending this event. */
export const OPEN_PALETTE_EVENT = "ft:palette-open";
const SEARCH_DELAY_MS = 120;

/**
 * ⌘K / Ctrl+K in ops (ops kit). Finds people by name, @handle or email (through paletteSearch, which checks
 * Users (view), the length and a rate limit on the server), the pages this person may open, and a few actions.
 * Arrows move, Enter opens: a person's record, a page, or the action. Once a choice is made the palette ignores
 * further keys while it closes, so a fast second Enter can't open something else. Glass, over a plain dim scrim.
 */
export function Palette({ entries, canPeople }: { entries: PaletteEntry[]; canPeople: boolean }) {
  const router = useRouter();
  const help = useKeysHelp();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<PalettePerson[]>([]);
  const [note, setNote] = useState("");
  const [active, setActive] = useState(0);
  const closing = useRef(false);
  const asked = useRef(0);
  const { ref, modalProps, returnFocusRef } = useModalDialog(open, () => setOpen(false));
  const listId = useId();

  useEffect(() => {
    const show = () => {
      if (isDialogOpen()) return; // never over another dialog
      closing.current = false;
      setQuery("");
      setPeople([]);
      setNote("");
      setActive(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "k" || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      e.preventDefault();
      if (ref.current?.open) setOpen(false);
      else show();
    };
    const onOpen = () => show();
    document.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, [ref]);

  // People: asked of the server a moment after typing stops; an older answer arriving late is dropped.
  const term = canPeople ? peopleQuery(query) : null;
  useEffect(() => {
    const n = ++asked.current;
    if (!term) return;
    const t = setTimeout(async () => {
      const r = await paletteSearch(term).catch(() => ({ ok: false as const, error: "Search didn't answer. Try again." }));
      if (n !== asked.current) return;
      setPeople(r.ok ? r.people : []);
      setNote(r.ok ? "" : r.error);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(t);
  }, [term]);

  const shownPeople = term ? people : [];
  const commands = rankCommands(query, entries, term ? 5 : 8);
  const options: Option[] = query.trim().startsWith("@")
    ? shownPeople.map((p) => ({ kind: "person" as const, person: p }))
    : [...shownPeople.map((p) => ({ kind: "person" as const, person: p })), ...commands.map((c) => ({ kind: "command" as const, entry: c }))];
  const at = Math.min(active, Math.max(0, options.length - 1));

  const choose = (o: Option | undefined) => {
    if (!o || closing.current) return;
    closing.current = true;
    if (o.kind === "person") {
      returnFocusRef.current = false;
      setOpen(false);
      router.push(`/admin/accounts/${o.person.id}`);
      focusMainSoon();
    } else if (o.entry.href) {
      returnFocusRef.current = false;
      setOpen(false);
      router.push(o.entry.href);
      focusMainSoon();
    } else {
      // Actions run once the palette has closed and given focus back.
      setOpen(false);
      if (o.entry.id === "keys") setTimeout(help, 0);
    }
  };

  const optionId = (i: number) => `${listId}-o${i}`;
  return (
    <dialog {...modalProps} aria-label="Search people, pages and actions" className="kit-palette kit-glass">
      {open && (
        <>
          <div className="kit-pal-in">
            <span aria-hidden className="text-mute">
              ⌕
            </span>
            <input
              autoFocus
              type="text"
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={options.length ? optionId(at) : undefined}
              aria-label={canPeople ? "Search people, pages and actions" : "Search pages and actions"}
              placeholder={canPeople ? "Name, @handle, email or a page" : "A page or an action"}
              autoComplete="off"
              spellCheck={false}
              value={query}
              onChange={(e) => {
                if (closing.current) return;
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (closing.current) {
                  if (e.key === "Enter" || e.key.startsWith("Arrow")) e.preventDefault();
                  return;
                }
                if (e.key === "ArrowDown" || e.key === "ArrowUp") {
                  e.preventDefault();
                  if (options.length) setActive((at + (e.key === "ArrowDown" ? 1 : -1) + options.length) % options.length);
                } else if (e.key === "Enter") {
                  e.preventDefault();
                  choose(options[at]);
                }
              }}
            />
            <kbd aria-hidden className="kit-kbd">
              Esc
            </kbd>
          </div>
          <ul id={listId} role="listbox" aria-label="Results" className="kit-pal-list">
            {options.map((o, i) => (
              <li
                key={o.kind === "person" ? `p${o.person.id}` : `c${o.entry.id}`}
                id={optionId(i)}
                role="option"
                aria-selected={i === at}
                className="kit-pal-opt"
                onPointerDown={(e) => e.preventDefault()}
                onPointerMove={() => i !== at && setActive(i)}
                onClick={() => choose(o)}
                ref={(el) => {
                  if (el && i === at) el.scrollIntoView?.({ block: "nearest" });
                }}
              >
                <span aria-hidden className="kit-pal-icon">
                  {o.kind === "person" ? "◉" : o.entry.href ? "›" : "⏎"}
                </span>
                <span className="min-w-0 truncate">{o.kind === "person" ? o.person.name : o.entry.label}</span>
                <span className="kit-pal-sub">{o.kind === "person" ? `@${o.person.handle}${o.person.email ? ` · ${o.person.email}` : ""}` : (o.entry.hint ?? o.entry.group)}</span>
              </li>
            ))}
            {!options.length && (
              <li role="presentation" className="kit-pal-empty">
                {note || (query.trim() && term === null && canPeople && query.trim().replace(/^@/, "").length < 2 ? "Type two letters or more to find people" : "Nothing found")}
              </li>
            )}
          </ul>
          {note && options.length > 0 && (
            <p role="status" className="kit-pal-note">
              {note}
            </p>
          )}
        </>
      )}
    </dialog>
  );
}

/** After opening a record from ⌘K, focus lands in the page, not back on whatever was focused before. */
function focusMainSoon() {
  let tries = 0;
  const go = () => {
    const main = document.getElementById("main");
    if (main && !document.querySelector("dialog[open]")) {
      if (!main.hasAttribute("tabindex")) main.tabIndex = -1;
      main.focus({ preventScroll: true });
    } else if (tries++ < 20) setTimeout(go, 50);
  };
  setTimeout(go, 50);
}
