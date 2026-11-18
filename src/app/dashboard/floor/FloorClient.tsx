"use client";

import { useToast } from "@/components/Toast";
import { PlayIcon, usePlayer, type PlayerTrack } from "@/components/Player";
import { linkShared } from "../link-shared";
import { CalloutShare } from "../collections/CalloutShare";
import type { ShareCardTarget } from "../collections/callout-card";
import { QUIET } from "./Crates";

const SHARE_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden className="size-[15px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 15V4M8 8l4-4 4 4M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" />
  </svg>
);

// The icon alone on phones; the word beside it from 1024px, where the row sits by the greeting.
const SHARE_CONTENT = (
  <>
    {SHARE_ICON}
    <span className="hidden lg:inline">Share</span>
  </>
);

/**
 * The receiving link as one dashed row (Design's option 41, 16 Nov): whose link it is, the address, Copy and Share.
 * With a callout to offer (owner, 10 Nov), Share opens the card sheet, which can still share the plain link.
 * `owner` is the desk owner's first name when someone else is looking (a teammate sees "Max's link").
 */
export function LinkRow({ link, card, owner }: { link: string; card?: ShareCardTarget; owner?: string }) {
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
    <div className="flex min-h-12 items-center gap-2.5 rounded-[14px] border border-dashed border-line-2 py-0.5 pl-3.5 pr-1 text-[13px]">
      <span className="shrink-0 text-bone">{owner ? `${owner}’s link` : "Your link"}</span>
      <span className="min-w-0 flex-1 truncate text-mute">{pretty}</span>
      <button type="button" onClick={copy} aria-label={`Copy your link, ${pretty}`} className={QUIET}>
        Copy
      </button>
      {card ? (
        <CalloutShare collectionId={card.collectionId} collectionName={card.collectionName} link={link} trigger={{ label: "Share your link or a card", className: QUIET, content: SHARE_CONTENT }} />
      ) : (
        <button type="button" onClick={share} aria-label="Share your link" className={QUIET}>
          {SHARE_CONTENT}
        </button>
      )}
    </div>
  );
}

/** Play all, on the Kept crate: this week's kept tracks go to the player, newest first. The words show from 1024px. */
export function PlayAllKept({ tracks }: { tracks: PlayerTrack[] }) {
  const { play } = usePlayer();
  return (
    <button type="button" onClick={() => play(tracks[0], tracks)} aria-label="Play all kept tracks" className={QUIET}>
      <PlayIcon playing={false} className="size-3.5" />
      <span className="hidden lg:inline">Play all</span>
    </button>
  );
}
