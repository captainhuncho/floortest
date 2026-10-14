"use client";

import Link from "next/link";
import { useRef, type KeyboardEvent, type ReactNode } from "react";

export type SegmentedItem<K extends string = string> = {
  key: K;
  label: ReactNode;
  /** Link segments: the segment navigates. Leave out for button segments (use `onChange`). */
  href?: string;
  disabled?: boolean;
};

type Props<K extends string> = {
  items: readonly SegmentedItem<K>[];
  /** The selected key. */
  value: K;
  /** Button segments: called with the picked key (arrow keys pick too, as radios do). */
  onChange?: (key: K) => void;
  /** Names the group for screen readers ("Billing period", "Layout"). */
  label: string;
  /** Stretch to the container and split it evenly (phones). */
  block?: boolean;
  className?: string;
};

/** From `start`, walking `dir` (wrapping), the first item that isn't disabled; -1 if none. Shared with Tabs. */
export function nextEnabled(items: readonly { disabled?: boolean }[], start: number, dir: number): number {
  const n = items.length;
  for (let k = 0, i = start; k < n; k++, i += dir || 1) {
    const at = ((i % n) + n) % n;
    if (!items[at].disabled) return at;
  }
  return -1;
}

/**
 * One way to pick one of a few views: a pill track, the selected segment a bone fill with ink text (it flips by day),
 * the others mute. Never lime: lime is for the next action, not for "this is chosen".
 *
 * Buttons (`onChange`): a radiogroup. One tab stop; arrow keys move and pick, Home / End jump to the ends.
 * Links (`href` on every item): a nav of links, the current one `aria-current="page"`; arrow keys move focus.
 * 44px targets on touch screens, 32px with a mouse.
 */
export function Segmented<K extends string>({ items, value, onChange, label, block, className = "" }: Props<K>) {
  const links = items.length > 0 && items.every((i) => i.href);
  const refs = useRef<(HTMLElement | null)[]>([]);

  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    const jump = e.key === "Home" ? 0 : e.key === "End" ? items.length - 1 : -1;
    if (!step && jump < 0) return;
    e.preventDefault();
    const next = nextEnabled(items, jump >= 0 ? jump : i + step, jump === 0 ? 1 : jump > 0 ? -1 : step);
    if (next < 0) return;
    refs.current[next]?.focus();
    if (!links && items[next].key !== value) onChange?.(items[next].key);
  };
  // A radiogroup always has one tab stop: the selected segment, or the first enabled one if nothing matches.
  const stop = items.some((it) => it.key === value) ? -1 : nextEnabled(items, 0, 1);

  const track = `${block ? "flex w-full" : "inline-flex"} items-center gap-0.5 rounded-full border border-line bg-ink-2 p-0.5 ${className}`;
  const seg = (on: boolean) =>
    `${block ? "flex-1" : ""} inline-flex min-h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-xs font-bold transition-colors duration-150 ease-out pointer-coarse:min-h-11 pointer-coarse:px-4 disabled:cursor-not-allowed disabled:opacity-40 ${
      on ? "bg-bone text-ink" : "text-mute hover:text-bone"
    }`;

  if (links)
    return (
      <nav aria-label={label} className={track}>
        {items.map((it, i) => {
          const on = it.key === value;
          return (
            <Link
              key={it.key}
              ref={(el) => {
                refs.current[i] = el;
              }}
              href={it.href!}
              aria-current={on ? "page" : undefined}
              onKeyDown={(e) => onKey(e, i)}
              className={seg(on)}
            >
              {it.label}
            </Link>
          );
        })}
      </nav>
    );

  return (
    <div role="radiogroup" aria-label={label} className={track}>
      {items.map((it, i) => {
        const on = it.key === value;
        return (
          <button
            key={it.key}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || i === stop ? 0 : -1}
            disabled={it.disabled}
            onClick={() => !on && onChange?.(it.key)}
            onKeyDown={(e) => onKey(e, i)}
            className={seg(on)}
          >
            {it.label}
          </button>
        );
      })}
    </div>
  );
}
