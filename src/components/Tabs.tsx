"use client";

import Link from "next/link";
import { useEffect, useRef, type ComponentProps, type HTMLAttributes, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { nextEnabled } from "./Segmented";

export type TabItem<K extends string = string> = {
  key: K;
  label: ReactNode;
  /** A number after the label, in tabular mute ("Kept 12"). */
  count?: ReactNode;
  /** Link tabs: the tab navigates. Leave out for button tabs (use `onChange`). */
  href?: string;
  disabled?: boolean;
  /** Button tabs: the id of the panel this tab shows (aria-controls). */
  controls?: string;
};

type LinkExtras = Omit<ComponentProps<typeof Link>, "href" | "className" | "children" | "aria-current">;

type Props<K extends string> = {
  items: readonly TabItem<K>[];
  /** The selected key. */
  value: K;
  /** Button tabs: called with the picked key. */
  onChange?: (key: K) => void;
  /** Names the row for screen readers ("Status", "Contacts view"). */
  label: string;
  /** Link tabs: extra props per link (prefetch, scroll, onClick, onMouseEnter…). */
  linkProps?: (item: TabItem<K>) => LinkExtras;
  className?: string;
  ref?: Ref<HTMLElement>;
} & Omit<HTMLAttributes<HTMLElement>, "onChange" | "className" | "children" | "role" | "aria-label">;

/**
 * One tabs style: a row over a 1px line, the selected tab bone with a 2px bone underline, the others mute. Never lime.
 * On phones it stays one row and scrolls sideways (no wrap, no scrollbar); the selected tab is kept in view.
 *
 * Links (`href` on every item): a <nav>, the current tab `aria-current="page"`, every tab a normal link.
 * Buttons (`onChange`): a tablist; one tab stop, arrow keys / Home / End move and pick, `aria-selected` on the
 * chosen tab and `aria-controls` when the item names its panel.
 * Extra attributes (data-pending, aria-busy, a ref) go on the row itself.
 */
export function Tabs<K extends string>({ items, value, onChange, label, linkProps, className = "", ref, ...rest }: Props<K>) {
  const links = items.length > 0 && items.every((i) => i.href);
  const row = useRef<HTMLElement | null>(null);
  const refs = useRef<(HTMLElement | null)[]>([]);
  const setRow = (el: HTMLElement | null) => {
    row.current = el;
    if (typeof ref === "function") ref(el);
    else if (ref) (ref as { current: HTMLElement | null }).current = el;
  };

  // Keep the selected tab in view inside the sideways-scrolling row (only the row scrolls, never the page).
  const at = items.findIndex((i) => i.key === value);
  useEffect(() => {
    const box = row.current;
    const tab = refs.current[at];
    if (!box || !tab) return;
    const left = tab.offsetLeft - box.offsetLeft;
    if (left < box.scrollLeft) box.scrollLeft = left;
    else if (left + tab.offsetWidth > box.scrollLeft + box.clientWidth) box.scrollLeft = left + tab.offsetWidth - box.clientWidth;
  }, [at]);

  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    const jump = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
    if (!step && jump < 0) return;
    e.preventDefault();
    const next = nextEnabled(items, jump >= 0 ? jump : i + step, jump === 0 ? 1 : jump > 0 ? -1 : step);
    if (next < 0) return;
    refs.current[next]?.focus();
    if (items[next].key !== value) onChange?.(items[next].key);
  };

  const rowClass = `flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--color-line)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`;
  const tabClass = (on: boolean) =>
    `inline-flex shrink-0 items-center whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors pointer-coarse:min-h-11 disabled:cursor-not-allowed disabled:opacity-40 ${
      on ? "border-bone text-bone" : "border-transparent text-mute hover:text-bone"
    }`;
  // One inline run, so the accessible name reads "Kept 12" with its space.
  const body = (it: TabItem<K>) => (
    <span>
      {it.label}
      {it.count !== undefined && it.count !== null && (
        <>
          {" "}
          <span className="tnum text-mute">{it.count}</span>
        </>
      )}
    </span>
  );

  if (links)
    return (
      <nav ref={setRow} aria-label={label} className={rowClass} {...rest}>
        {items.map((it, i) => {
          const on = it.key === value;
          return (
            <Link
              key={it.key}
              {...linkProps?.(it)}
              ref={(el) => {
                refs.current[i] = el;
              }}
              href={it.href!}
              aria-current={on ? "page" : undefined}
              className={tabClass(on)}
            >
              {body(it)}
            </Link>
          );
        })}
      </nav>
    );

  const stop = at >= 0 ? at : nextEnabled(items, 0, 1);
  return (
    <div ref={setRow} role="tablist" aria-label={label} className={rowClass} {...rest}>
      {items.map((it, i) => {
        const on = it.key === value;
        return (
          <button
            key={it.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={it.controls}
            tabIndex={i === stop ? 0 : -1}
            disabled={it.disabled}
            onClick={() => !on && onChange?.(it.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={tabClass(on)}
          >
            {body(it)}
          </button>
        );
      })}
    </div>
  );
}
