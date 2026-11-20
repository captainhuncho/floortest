"use client";

import { useState } from "react";
import { Icon } from "@/components/Kit";

/**
 * The folders on Collections: a search field, the filter beside it, then the folders (rows on phones, a grid of covers
 * from md). Search narrows by name as you type, in the browser; nothing is sent. Projects (owner, 19 Nov: option 63 A)
 * puts its filter in its own bar, draws tiles two a row on phones, and shows search only once the list is long.
 */
export function FolderList({
  items,
  label,
  filter,
  empty,
  tiles = false,
  searchFrom = 0,
}: {
  items: { key: string; name: string; node: React.ReactNode }[];
  /** The list's spoken name. */
  label: string;
  filter?: React.ReactNode;
  /** Shown when there is nothing here at all. */
  empty: React.ReactNode;
  /** Tiles at every size: two a row on phones, up to five on a laptop. */
  tiles?: boolean;
  /** Search shows from this many folders (Projects: 7; a short list needs none). */
  searchFrom?: number;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? items.filter((i) => i.name.toLowerCase().includes(needle)) : items;
  const search = items.length >= searchFrom;
  return (
    <div className="flex flex-col gap-3 md:gap-4">
      {(search || filter) && (
        <div className="flex flex-col gap-2 md:flex-row-reverse md:items-center md:justify-between">
          {search && (
            <label className="relative block md:w-64">
              <span className="sr-only">Search your folders</span>
              <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
              <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your folders" autoComplete="off" className="input min-h-11 pl-9! text-base md:text-[13px]" />
            </label>
          )}
          {filter}
        </div>
      )}
      {shown.length > 0 && (
        <ul
          aria-label={label}
          className={
            tiles
              ? "grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 md:gap-x-4 md:gap-y-6 lg:grid-cols-4 xl:grid-cols-5"
              : "flex flex-col divide-y divide-line md:grid md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-x-4 md:gap-y-6 md:divide-y-0"
          }
        >
          {shown.map((i) => (
            <li key={i.key} className={tiles ? "min-w-0" : "py-2 md:py-0"}>
              {i.node}
            </li>
          ))}
        </ul>
      )}
      <div role="status" className="text-[12px] text-mute">
        {items.length === 0 ? empty : shown.length === 0 ? `No folder is called “${query.trim()}”.` : null}
      </div>
    </div>
  );
}
