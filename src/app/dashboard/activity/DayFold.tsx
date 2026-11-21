"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** How many entries a day shows before it folds. */
export const FOLD_AT = 8;

/**
 * A busy day's rows: the first eight, then one button that shows the rest in place (no new query: the rows are already
 * here). After it opens, focus moves to the first row that was hidden, so a keyboard or screen reader carries on there.
 */
export function DayFold({ rows, label }: { rows: ReactNode[]; label: string }) {
  const [open, setOpen] = useState(rows.length <= FOLD_AT);
  const firstNew = useRef<HTMLLIElement>(null);
  const opened = useRef(false);
  useEffect(() => {
    if (open && opened.current) firstNew.current?.focus();
  }, [open]);
  const shown = open ? rows : rows.slice(0, FOLD_AT);
  const more = rows.length - FOLD_AT;

  return (
    <>
      <ol className="flex flex-col">
        {shown.map((row, i) => (
          <li
            key={i}
            ref={i === FOLD_AT ? firstNew : undefined}
            tabIndex={i === FOLD_AT ? -1 : undefined}
            className="border-b border-line outline-offset-[-2px] last:border-b-0"
          >
            {row}
          </li>
        ))}
      </ol>
      {!open && (
        <button
          type="button"
          onClick={() => {
            opened.current = true;
            setOpen(true);
          }}
          className="mt-0.5 mb-2 flex min-h-11 w-full items-center justify-center rounded-xl border border-line text-[14px] font-semibold text-bone hover:border-line-2"
        >
          Show {more} more from {label}
        </button>
      )}
    </>
  );
}
