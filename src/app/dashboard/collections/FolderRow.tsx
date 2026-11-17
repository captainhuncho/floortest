import Link from "next/link";
import { Icon } from "@/components/Kit";

/**
 * Collections as folders (owner, 17 Nov: "collection and projects can just be folders"). Every callout, project and
 * folder of them is one of these: a cover, its name and one line. A row on phones, a square cover in a grid from md.
 */

/**
 * A folder's cover shows the music, never a folder icon (owner, 17 Nov: option 57 I, "four covers"). Four pieces of art
 * or more: a 2x2 square, no gaps, top left first. One to three: the first, full size (never repeated to fill four).
 * None: the plain tile with a small music note. `empty` (nothing inside and no art): a dashed square. Decoration only:
 * the row's link says what it is. `className` sets size and the outer corner; the art is clipped to it.
 */
export function FolderCover({ covers, empty = false, className, eager = false }: { covers: string[]; empty?: boolean; className: string; /** Above the fold (a folder's own page): load at once. */ eager?: boolean }) {
  const loading = eager ? "eager" : "lazy";
  if (covers.length === 0)
    return empty ? (
      <span aria-hidden className={`block shrink-0 border-[1.5px] border-dashed border-mute opacity-70 ${className}`} />
    ) : (
      <span aria-hidden className={`grid shrink-0 place-items-center border border-line bg-well text-faint ${SHADOW} ${className}`}>
        <Icon name="music" className="h-[34%] w-[34%]" />
      </span>
    );
  const shown = covers.length >= 4 ? covers.slice(0, 4) : covers.slice(0, 1);
  return (
    <span aria-hidden className={`grid shrink-0 overflow-hidden bg-well ${shown.length === 4 ? "grid-cols-2 grid-rows-2" : ""} ${SHADOW} ${className}`}>
      {shown.map((src) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img key={src} src={src} alt="" loading={loading} decoding="async" className="size-full min-h-0 min-w-0 object-cover" />
      ))}
    </span>
  );
}

/** The cover's one shadow: soft, no glow, no colour (option 57 I). */
const SHADOW = "shadow-[0_8px_18px_-12px_rgb(0_0_0/0.5)]";

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
export function FolderRow({ href, name, spoken, covers, empty, line, menu, children }: { href: string; name: string; spoken: string; /** Up to four art URLs (FolderCover). */ covers: string[]; /** Nothing inside: the dashed cover. */ empty?: boolean; line: React.ReactNode; menu?: React.ReactNode; /** The row's own sheets and dialogs. */ children?: React.ReactNode }) {
  return (
    <div data-card className="relative flex items-center gap-3 md:flex-col md:items-stretch md:gap-2">
      <FolderCover covers={covers} empty={empty} className="h-14 w-14 rounded-[10px] md:aspect-square md:h-auto md:w-full md:rounded-[14px]" />
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
