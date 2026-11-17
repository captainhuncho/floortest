import Link from "next/link";
import { Icon } from "@/components/Kit";

/**
 * Collections as folders (owner, 17 Nov: "collection and projects can just be folders"). Every callout, project and
 * folder of them is one of these: a cover, its name and one line. A row on phones, a square cover in a grid from md.
 */

/** A folder's cover: its artwork, or the folder shape when it has none (never a made-up colour). */
export function FolderCover({ art, className }: { art: string | null; className: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  if (art) return <img src={art} alt="" loading="lazy" decoding="async" className={`shrink-0 border border-line object-cover ${className}`} />;
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center border border-line bg-well text-faint ${className}`}>
      <Icon name="folder" className="h-[42%] w-[42%]" />
    </span>
  );
}

/** The ··· on a folder or a folder page; Kit has no "more" icon, so it's drawn here. */
export function MoreDots() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-[18px]" fill="currentColor">
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  );
}

/** A bare 44px round control (···, back, link), with no box of its own. */
export const ROUND = "relative z-10 grid size-11 shrink-0 place-items-center rounded-full text-mute transition-colors hover:bg-well hover:text-bone";

/** Where a callout stands, in words: Receiving (with the lime dot), Open, Full, or Closed with its date. */
export function CalloutState({ live, closed, full, closesLabel }: { live: boolean; closed: boolean; full: boolean; closesLabel: string | null }) {
  if (live)
    return (
      <span className="text-bone">
        <span aria-hidden className="mr-1 inline-block size-1.5 rounded-full bg-lime align-middle" />
        Receiving
      </span>
    );
  return <>{closed ? (full ? "Full" : `Closed${closesLabel ? ` ${closesLabel}` : ""}`) : "Open"}</>;
}

export const trackCount = (n: number) => `${n} ${n === 1 ? "track" : "tracks"}`;

/**
 * One folder in the list. The whole row (or tile) opens it; `menu` is its ··· button, above the link.
 * `spoken` is what a screen reader hears: "Open Night set, callout, 12 tracks".
 */
export function FolderRow({ href, name, spoken, art, line, menu, children }: { href: string; name: string; spoken: string; art: string | null; line: React.ReactNode; menu?: React.ReactNode; /** The row's own sheets and dialogs. */ children?: React.ReactNode }) {
  return (
    <div data-card className="relative flex items-center gap-3 md:flex-col md:items-stretch md:gap-2">
      <FolderCover art={art} className="h-14 w-14 rounded-[10px] md:aspect-square md:h-auto md:w-full md:rounded-[14px]" />
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <div className="min-w-0 flex-1">
          <Link href={href} aria-label={spoken} className="block truncate text-[14px] font-semibold tracking-[-0.01em] text-bone after:absolute after:inset-0 after:rounded-[14px]">
            {name}
          </Link>
          <p className="mt-0.5 truncate text-[11.5px] text-mute tnum md:line-clamp-2 md:whitespace-normal">{line}</p>
        </div>
        {menu}
      </div>
      {children}
    </div>
  );
}
