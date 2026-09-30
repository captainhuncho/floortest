"use client";

import { useState } from "react";
import { setActiveCollection } from "../actions";

/** Your permanent link: copy, preview, and which collection new tracks go to. */
export function LinkCard({ link, handle, collections, activeId }: { link: string; handle: string; collections: { id: number; name: string; closed: boolean }[]; activeId: number | null }) {
  const [copied, setCopied] = useState(false);
  const pretty = link.replace(/^https?:\/\//, "");
  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="text-[9px] font-bold uppercase tracking-[1px] text-faint">Your permanent link</p>
        <p className="mt-1.5 truncate text-[12px]">
          {pretty.replace(handle, "")}
          <span className="text-lime">{handle}</span>
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          className="flex-1 rounded-md bg-bone px-3 py-1.5 text-[11px] font-bold text-ink transition active:scale-95"
          onClick={() => {
            navigator.clipboard?.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <a href={`/${handle}`} target="_blank" className="rounded-md border border-line px-3 py-1.5 text-[11px] font-bold text-mute hover:text-bone">
          Preview
        </a>
      </div>
      <form action={async (fd) => void (await setActiveCollection(Number(fd.get("id"))))}>
        <label htmlFor="routes-to" className="mb-1.5 block text-[9px] font-bold uppercase tracking-[1px] text-faint">
          Sends new tracks to
        </label>
        <select
          id="routes-to"
          name="id"
          defaultValue={activeId ?? undefined}
          key={activeId}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className="input py-2 text-[12px]"
        >
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.closed ? " (closed)" : ""}
            </option>
          ))}
        </select>
      </form>
    </div>
  );
}
