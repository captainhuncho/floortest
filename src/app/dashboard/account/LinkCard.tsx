"use client";

import { useState } from "react";
import { Icon } from "@/components/Kit";
import { setActiveCollection } from "../actions/collections";
import { QrButton } from "./QrRow";
import { CalloutShare } from "../collections/CalloutShare";
import type { ShareCardTarget } from "../collections/callout-card";

/** Your receiving link: copy, the QR code, preview, and which collection new tracks go to. */
export function LinkCard({ link, handle, collections, activeId, canManage = true, card }: { link: string; handle: string; collections: { id: number; name: string; closed: boolean }[]; activeId: number | null; /** Owner or A&R / Admin: may change where the link sends tracks. */ canManage?: boolean; /** The callout Share offers as a card (owner, 10 Nov). */ card?: ShareCardTarget }) {
  const [copied, setCopied] = useState(false);
  const pretty = link.replace(/^https?:\/\//, "");
  const ghost = "inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] border border-line bg-card px-2.5 text-[12px] font-semibold text-bone hover:border-line-2 pointer-coarse:min-h-11";
  return (
    <div className="flex flex-col gap-3">
      {/* Four buttons leave a phone too little room for the address, so there it takes its own line. */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-line bg-well py-1 pl-3 pr-1">
        <p className="min-w-0 flex-1 truncate font-mono text-[12px] text-bone max-sm:basis-full max-sm:py-1.5">
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
        {card ? (
          <CalloutShare
            collectionId={card.collectionId}
            collectionName={card.collectionName}
            link={link}
            trigger={{ label: "Share your link or a card", className: `${ghost} w-10 px-0`, content: <Icon name="share" className="size-[15px]" /> }}
          />
        ) : (
          <button
            type="button"
            aria-label="Share your link"
            className={`${ghost} w-10 px-0`}
            onClick={async () => {
              if (!navigator.share) return void navigator.clipboard?.writeText(link);
              try {
                await navigator.share({ title: "Send me your music", url: link });
              } catch {
                // Closing the share sheet isn't an error worth saying anything about.
              }
            }}
          >
            <Icon name="share" className="size-[15px]" />
          </button>
        )}
        <QrButton handle={handle} link={link} className={`${ghost} w-10 px-0`} />
        <a href={`/${handle}`} target="_blank" aria-label="Preview your page (opens in a new tab)" className={`${ghost} w-10 px-0`}>
          <Icon name="user" className="size-[15px]" />
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
