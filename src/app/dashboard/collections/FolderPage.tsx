import Link from "next/link";
import { Icon } from "@/components/Kit";
import { fmtTime } from "@/lib/format";
import { FolderCover, ROUND } from "./FolderRow";

/** Total length as "1 h 04 min" or "12 min" (a track's own length stays m:ss). */
export function fmtLength(sec: number) {
  if (!sec) return "0 min";
  const m = Math.round(sec / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min` : m ? `${m} min` : fmtTime(sec);
}

/** The one wide button on a folder page (Review N new on a callout). */
export const WIDE = "flex min-h-12 w-full items-center justify-center gap-2 rounded-[14px] border border-line bg-well px-4 text-[14px] font-semibold text-bone transition-colors hover:border-line-2";

/**
 * A folder's page, the same for a callout and a project (owner, 17 Nov: option 43): back and its tools across the top,
 * a big cover (option 57 I: the music, centred on phones, on the left from lg; it fades in over 240ms, at once with Reduce
 * Motion), the name, one or two lines of facts, shuffle and play, one wide button, then what's in it. Prepare is the same
 * page (option 44): no back (it's a tab), a small label over the name, and its own cover made from the covers inside.
 */
export function FolderPage({ back, tools, covers = [], empty, cover, label, name, lines, play, action, children }: { back?: { href: string; label: string }; /** Link and ··· on the right of the top row. */ tools?: React.ReactNode; /** Up to four art URLs (FolderCover). */ covers?: string[]; /** Nothing inside: the dashed cover. */ empty?: boolean; /** Drawn in the cover's box instead of `covers` (Prepare's crate). */ cover?: React.ReactNode; /** A small line over the name (Prepare). */ label?: string; name: string; lines: React.ReactNode[]; /** Shuffle and play. */ play?: React.ReactNode; /** The wide button. */ action?: React.ReactNode; children: React.ReactNode }) {
  const box = "mx-auto size-[200px] rounded-[14px] motion-safe:animate-[badge-fade-in_240ms_ease-out] lg:sticky lg:top-4 lg:mx-0 lg:aspect-square lg:size-auto lg:w-full";
  return (
    <div className="page-gutter py-3 sm:py-6">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-3 sm:gap-4">
        {back && (
          <div className="-mx-2 flex items-center justify-between gap-2">
            <Link href={back.href} aria-label={`Back to ${back.label}`} className={ROUND}>
              <Icon name="chev" className="size-[18px] rotate-180" />
            </Link>
            <div className="flex items-center">{tools}</div>
          </div>
        )}
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start lg:gap-8 min-[1180px]:grid-cols-[260px_minmax(0,1fr)]">
          {cover ? (
            <span aria-hidden className={`block shrink-0 overflow-hidden border border-line bg-well ${box}`}>
              {cover}
            </span>
          ) : (
            <FolderCover covers={covers} empty={empty} eager className={box} />
          )}
          <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
                {label && <p className="mb-1 text-[11.5px] font-semibold text-mute">{label}</p>}
                <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-bone [overflow-wrap:anywhere] lg:text-[28px]">{name}</h1>
                {lines.map((l, i) => (
                  <p key={i} className="mt-1 text-[12.5px] text-mute tnum">
                    {l}
                  </p>
                ))}
              </div>
              {play}
            </div>
            {action}
            {/* On touch sizes every control in the lists below is at least 44px tall. */}
            <div className="contents max-lg:[&_a]:min-h-11 max-lg:[&_button]:min-h-11">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
