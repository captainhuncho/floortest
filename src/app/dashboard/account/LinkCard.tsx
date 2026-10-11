"use client";

import { useState } from "react";
import { setActiveCollection } from "../actions/collections";

/** Your receiving link: copy, preview, and which collection new tracks go to. */
export function LinkCard({ link, handle, collections, activeId, canManage = true }: { link: string; handle: string; collections: { id: number; name: string; closed: boolean }[]; activeId: number | null; /** Owner or A&R / Admin: may change where the link sends tracks. */ canManage?: boolean }) {
  const [copied, setCopied] = useState(false);
  const pretty = link.replace(/^https?:\/\//, "");
  return (
    <div className="flex flex-col gap-3">
      <p className="truncate text-[13px] md:text-[18px]">
        {pretty.replace(handle, "")}
        <span className="text-lime">{handle}</span>
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="btn-lime btn-sm flex-1 md:min-h-10"
          onClick={() => {
            navigator.clipboard?.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <a href={`/${handle}`} target="_blank" className="btn-ghost btn-sm md:min-h-10">
          Preview
        </a>
      </div>
      {canManage ? (
        <form action={async (fd) => void (await setActiveCollection(Number(fd.get("id"))))}>
          <label htmlFor="routes-to" className="mb-1.5 block eyebrow text-faint">
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
      ) : (
        <p className="text-[12px] text-mute">Sends new tracks to {collections.find((c) => c.id === activeId)?.name ?? "no collection yet"}.</p>
      )}
    </div>
  );
}
