"use client";

import { useToast } from "@/components/Toast";
import { linkShared } from "../link-shared";
import { GHOST_ON_WELL } from "../kitButtons";
import { CalloutShare } from "../collections/CalloutShare";
import type { ShareCardTarget } from "../collections/callout-card";

const SHARE_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden className="size-[15px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15V4M8 8l4-4 4 4M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" />
  </svg>
);

/**
 * The receiving link as the mock draws it (owner, 30 Oct): the address in mono, Copy, and Share. With a callout to
 * offer (owner, 10 Nov), Share opens the card sheet, which can still share the plain link.
 */
export function LinkRow({ link, card }: { link: string; card?: ShareCardTarget }) {
  const toast = useToast();
  const pretty = link.replace(/^https?:\/\//, "");
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      linkShared();
      toast.show({ message: "Your link is copied. Paste it anywhere." });
    } catch {
      toast.show({ message: `Couldn't copy. Your link is ${pretty}`, tone: "error" });
    }
  }
  async function share() {
    if (!navigator.share) return copy();
    try {
      await navigator.share({ title: "Send me your music", url: link });
      linkShared();
    } catch {
      // Closing the share sheet isn't an error worth saying anything about.
    }
  }
  return (
    <div className="flex items-center gap-1.5 rounded-xl border border-line bg-well py-1 pl-3 pr-1">
      <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-bone">{pretty}</span>
      <button type="button" onClick={copy} aria-label={`Copy your link, ${pretty}`} className={GHOST_ON_WELL}>
        <svg viewBox="0 0 24 24" aria-hidden className="size-[15px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10 8.5h8a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 8.5 18v-8A1.5 1.5 0 0 1 10 8.5zM15.5 8.5V6A1.5 1.5 0 0 0 14 4.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" />
        </svg>
        Copy
      </button>
      {card ? (
        <CalloutShare
          collectionId={card.collectionId}
          collectionName={card.collectionName}
          link={link}
          trigger={{ label: "Share your link or a card", className: GHOST_ON_WELL.replace("px-3", "w-10 px-0"), content: SHARE_ICON }}
        />
      ) : (
        <button type="button" onClick={share} aria-label="Share your link" className={GHOST_ON_WELL.replace("px-3", "w-10 px-0")}>
          {SHARE_ICON}
        </button>
      )}
    </div>
  );
}
