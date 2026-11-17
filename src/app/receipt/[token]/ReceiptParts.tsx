import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/Kit";

/**
 * The pieces the receipt's screens share (owner, 17 Nov: laid out like a payment receipt). No hooks, so the server
 * page, the loading skeleton and the client components can all use them.
 */

/** The receipt's column: ~600px, centred, light or dark with the visitor's device. The pinned bar handles the home bar on phones. */
export const PAGE = "theme-system mx-auto flex min-h-dvh w-full max-w-[600px] flex-col gap-3 bg-ink px-3.5 pt-[max(1.25rem,env(safe-area-inset-top))] text-bone sm:px-6 sm:pb-10 sm:pt-10";

/** A small label over a card's content. */
export const LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-mute";

/** A quiet full-width button: the second-rank actions (Send another, Add more stems). */
export const QUIET = "flex min-h-12 w-full items-center justify-center gap-2 rounded-[24px] border border-line-2 bg-card px-5 text-[14px] font-semibold text-bone transition-colors hover:bg-well disabled:opacity-50";

/** The one main action of a screen. */
export const MAIN = "btn-lime min-h-12 w-full rounded-[24px] px-5 text-[14px] sm:mx-auto sm:w-auto sm:min-w-[16rem]";

const KIT: Record<string, IconName> = { listened: "head", downloaded: "dl", waiting: "clock", unheard: "clock", code: "mail" };
// The three the shared icon set doesn't have, in its stroke style.
const OWN: Record<string, ReactNode> = {
  replied: <path d="M20 12a7.5 7.5 0 0 1-11 6.6L4.5 20l1.3-4.2A7.5 7.5 0 1 1 20 12z" />,
  played_out: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  closed: (
    <>
      <path d="M6.5 3.5h11v17l-2.75-1.75L12 20.5l-2.75-1.75L6.5 20.5z" />
      <path d="M9.5 8.5h5M9.5 12h5" />
    </>
  ),
};

/** The round status icon at the top of every receipt screen. Strong events are white, waiting ones dim. */
export function Disc({ status, strong = true }: { status: string; strong?: boolean }) {
  return (
    <span aria-hidden className={`grid size-16 shrink-0 place-items-center rounded-full border border-line bg-card ${strong ? "text-bone" : "text-mute"}`}>
      {OWN[status] ? (
        <svg viewBox="0 0 24 24" className="size-7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          {OWN[status]}
        </svg>
      ) : (
        <Icon name={KIT[status] ?? "clock"} className="size-7" />
      )}
    </span>
  );
}

/**
 * The bar with a screen's action. On phones it's the last thing on the page and stays at the bottom while the rest
 * scrolls, above the home bar; the content fades out under it, and because it sits in the page's flow it never covers
 * the last step. From 640px wide, and on screens too short to spare the room, nothing is pinned: it sits in the flow.
 * `lift` raises it by that many px, for the on-screen keyboard (ShowDetails).
 */
export function PinnedBar({ children, lift }: { children: ReactNode; lift?: number }) {
  return (
    <div style={lift ? { bottom: lift } : undefined} className="sticky bottom-0 z-10 order-last -mx-3.5 flex flex-col items-center gap-1 bg-[linear-gradient(to_bottom,transparent,var(--color-ink)_1.5rem)] px-3.5 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-8 sm:static sm:order-none sm:mx-0 sm:bg-none sm:p-0 [@media(max-height:499px)]:static [@media(max-height:499px)]:bg-none [@media(max-height:499px)]:pt-3">
      {children}
    </div>
  );
}

/** The room the pinned bar would have left at the bottom of a phone screen, for a screen with nothing to pin. */
export function BarGap() {
  return <div aria-hidden className="order-last h-[max(1.5rem,env(safe-area-inset-bottom))] shrink-0 sm:hidden" />;
}

/** A short screen: the icon, one headline and a line, centred in the middle; its one action in the bar. */
export function ShortScreen({ status, title, children, action }: { status: string; title: string; children: ReactNode; action: ReactNode }) {
  return (
    <main className={PAGE}>
      <div className="my-auto flex flex-col items-center gap-2 px-2 py-8 text-center">
        <Disc status={status} strong={false} />
        <h1 className="mt-1 text-balance text-[28px] font-semibold leading-[1.1] tracking-[-0.02em] text-mute">{title}</h1>
        <div className="max-w-[34ch] text-pretty text-[13px] leading-[1.5] text-mute">{children}</div>
      </div>
      <PinnedBar>{action}</PinnedBar>
    </main>
  );
}
