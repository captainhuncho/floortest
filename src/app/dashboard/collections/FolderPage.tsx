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
 * a big cover (centred on phones, on the left from lg), the name, one or two lines of facts, shuffle and play, one wide
 * button, then what's in it.
 */
export function FolderPage({ back, tools, art, name, lines, play, action, children }: { back: { href: string; label: string }; /** Link and ··· on the right of the top row. */ tools?: React.ReactNode; art: string | null; name: string; lines: React.ReactNode[]; /** Shuffle and play. */ play?: React.ReactNode; /** The wide button. */ action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="page-gutter py-3 sm:py-6">
      <div className="mx-auto flex w-full min-w-0 max-w-6xl flex-col gap-3 sm:gap-4">
        <div className="-mx-2 flex items-center justify-between gap-2">
          <Link href={back.href} aria-label={`Back to ${back.label}`} className={ROUND}>
            <Icon name="chev" className="size-[18px] rotate-180" />
          </Link>
          <div className="flex items-center">{tools}</div>
        </div>
        <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[180px_minmax(0,1fr)] lg:items-start lg:gap-8 min-[1180px]:grid-cols-[260px_minmax(0,1fr)]">
          <FolderCover art={art} className="mx-auto h-40 w-40 rounded-[16px] lg:sticky lg:top-4 lg:mx-0 lg:aspect-square lg:h-auto lg:w-full" />
          <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
            <div className="flex items-end gap-3">
              <div className="min-w-0 flex-1">
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
