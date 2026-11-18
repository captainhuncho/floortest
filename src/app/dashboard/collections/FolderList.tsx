"use client";

import { useState } from "react";
import { Icon } from "@/components/Kit";

/**
 * The folders on Collections: a search field, the filter beside it, then the folders (rows on phones, a grid of covers
 * from md). Search narrows by name as you type, in the browser; nothing is sent.
 */
export function FolderList({ items, label, filter, empty }: { items: { key: string; name: string; node: React.ReactNode }[]; /** The list's spoken name. */ label: string; filter: React.ReactNode; /** Shown when there is nothing here at all. */ empty: React.ReactNode }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? items.filter((i) => i.name.toLowerCase().includes(needle)) : items;
  return (
    <div className="flex flex-col gap-3 md:gap-4">
      <div className="flex flex-col gap-2 md:flex-row-reverse md:items-center md:justify-between">
        <label className="relative block md:w-64">
          <span className="sr-only">Search your folders</span>
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-mute" />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search your folders" autoComplete="off" className="input min-h-11 pl-9! text-base md:text-[13px]" />
        </label>
        {filter}
      </div>
      {shown.length > 0 && (
        <ul aria-label={label} className="flex flex-col divide-y divide-line md:grid md:grid-cols-[repeat(auto-fill,minmax(180px,1fr))] md:gap-x-4 md:gap-y-6 md:divide-y-0">
          {shown.map((i) => (
            <li key={i.key} className="py-2 md:py-0">
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
