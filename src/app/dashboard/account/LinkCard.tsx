"use client";

import { useState } from "react";
import { Icon } from "@/components/Kit";
import { setActiveCollection } from "../actions/collections";
import { QrButton } from "./QrRow";

/** Your receiving link: copy, the QR code, preview, and which collection new tracks go to. */
export function LinkCard({ link, handle, collections, activeId, canManage = true }: { link: string; handle: string; collections: { id: number; name: string; closed: boolean }[]; activeId: number | null; /** Owner or A&R / Admin: may change where the link sends tracks. */ canManage?: boolean }) {
  const [copied, setCopied] = useState(false);
  const pretty = link.replace(/^https?:\/\//, "");
  const ghost = "inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-card px-2.5 text-[12px] font-semibold text-bone hover:border-line-2 pointer-coarse:min-h-11";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 rounded-xl border border-line bg-well py-1 pl-3 pr-1">
        <p className="min-w-0 flex-1 truncate font-mono text-[12px] text-bone">
          {pretty.replace(handle, "")}
          <span className="text-lime">{handle}</span>
        </p>
        <button
          type="button"
          className={ghost}
          onClick={() => {
            navigator.clipboard?.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          <Icon name="copy" className="size-[15px]" />
          {copied ? "Copied" : "Copy"}
        </button>
        <QrButton handle={handle} link={link} className={`${ghost} w-10 px-0`} />
        <a href={`/${handle}`} target="_blank" aria-label="Preview your page (opens in a new tab)" className={`${ghost} w-10 px-0`}>
          <Icon name="share" className="size-[15px]" />
        </a>
      </div>
      {canManage ? (
        <form action={async (fd) => void (await setActiveCollection(Number(fd.get("id"))))}>
          <label htmlFor="routes-to" className="mb-1 block text-[11.5px] text-mute">
            Sends new tracks to
          </label>
          <select
            id="routes-to"
            name="id"
            defaultValue={activeId ?? ""}
            key={activeId}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="input py-2 text-[16px] sm:text-[12px]"
          >
            {/* No collection: new tracks land in the Review Queue, unsorted. Picking a collection points the link at it. */}
            {!activeId && (
              <option value="" disabled>
                Review Queue (no collection)
              </option>
            )}
            {collections.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.closed ? " (closed)" : ""}
              </option>
            ))}
          </select>
        </form>
      ) : (
        <p className="text-[11.5px] text-mute">Sends new tracks to {collections.find((c) => c.id === activeId)?.name ?? "the Review Queue"}.</p>
      )}
    </div>
  );
}
