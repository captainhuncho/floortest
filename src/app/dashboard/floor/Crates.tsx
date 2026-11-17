/**
 * The Floor's building blocks since the 16 Nov redesign (Design's option 41, "Floor, final"): the two crates (Waiting
 * and Kept this week, each a fan of covers over one big number), the notice strip and the plain rows under "This week"
 * and "Earlier". Server components; the buttons that play or copy live in FloorClient.
 */

import Link from "next/link";
import { Icon, type IconName } from "@/components/Kit";

/** The Floor's quiet button: a hairline box, 44px at every size, so lime stays for the one or two things to do next. */
export const QUIET =
  "inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] border border-line px-3 text-[13px] font-medium text-bone transition hover:border-mute hover:bg-well disabled:cursor-not-allowed disabled:opacity-40";

/** A small section label ("This week", "Earlier", "After the weekend"). */
export const LABEL = "text-[13px] font-semibold text-mute";

export type CrateCover = { id: number; title: string; art: string | null };

/** Up to three covers fanned like sleeves in a crate: the track's artwork, or its title on a plain sleeve. Decorative. */
function Fan({ covers }: { covers: CrateCover[] }) {
  const tilt = ["left-0 -rotate-[8deg]", "left-[18px] -rotate-2 lg:left-7", "left-9 rotate-[5deg] lg:left-14"];
  return (
    // Hidden on a phone held sideways, where the height is needed for the numbers and buttons.
    <div aria-hidden className="relative h-[120px] lg:h-[180px] [@media(max-height:500px)]:hidden">
      {covers.slice(0, 3).map((c, i) => (
        <span
          key={c.id}
          className={`absolute top-3 flex aspect-square w-[min(96px,calc(100%-36px))] items-end overflow-hidden rounded-[10px] border border-line bg-well lg:w-[150px] ${tilt[i]}`}
        >
          {c.art ? (
            // eslint-disable-next-line @next/next/no-img-element -- private artwork behind a short-lived signed link, at the size shown
            <img src={c.art} alt="" width={150} height={150} loading="lazy" decoding="async" className="size-full object-cover" />
          ) : (
            <span className="line-clamp-3 break-words p-2 text-[11px] font-semibold leading-[1.15] text-bone lg:text-[13px]">{c.title}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/**
 * One crate: covers on top, then the number with its lines and the actions. On phones the actions sit under the number;
 * from 1024px they sit beside it. `wide` is the crate on its own (a quiet week): one row, no covers.
 */
export function Crate({
  label,
  covers = [],
  hot = false,
  wide = false,
  n,
  lines,
  actions,
}: {
  /** The crate's name for screen readers ("Waiting", "Kept this week"). */
  label: string;
  covers?: CrateCover[];
  /** Outlined in the accent: something here needs you. */
  hot?: boolean;
  wide?: boolean;
  n: number;
  lines: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <section
      aria-label={label}
      className={`flex min-w-0 gap-3 rounded-[20px] border bg-card p-3.5 lg:p-[22px] ${hot ? "border-lime" : "border-line"} ${
        wide ? "col-span-2 flex-wrap items-center justify-between" : "flex-col"
      }`}
    >
      {!wide && covers.length > 0 && <Fan covers={covers} />}
      <div className={wide ? "contents" : "mt-auto flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end lg:justify-between"}>
        <div className="min-w-0">
          <p className="text-[40px] font-bold leading-none text-bone tnum lg:text-[64px]">{n}</p>
          <div className="mt-1 text-[13px] leading-snug text-mute">{lines}</div>
        </div>
        <div className="flex gap-1.5 lg:gap-2">{actions}</div>
      </div>
    </section>
  );
}

/** One thing to know or fix, under the top bar: the line and, when this person can act on it, the way to fix it. */
export function Notice({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div role="alert" className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-[14px] border border-line bg-card py-2.5 pl-3.5 pr-2.5">
      <p className="min-w-[12rem] flex-1 text-[13px] leading-snug text-bone">{children}</p>
      {action}
    </div>
  );
}

/** A plain row: an icon box, a title over one line of detail, and a chevron when it opens something. */
export function FloorRow({ icon, title, detail, when, href }: { icon: IconName; title: string; detail: string; when?: string; href?: string }) {
  const body = (
    <>
      <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-card text-mute">
        <Icon name={icon} className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] text-bone">{title}</span>
        {/* Read as one line: "Your week · 11 tracks in · 3 kept". */}
        <span className="sr-only"> · </span>
        <span className="mt-0.5 block text-[12px] text-mute tnum">{detail}</span>
      </span>
      {when && <span className="shrink-0 text-[12px] text-faint tnum">{when}</span>}
      {href && <Icon name="chev" className="size-4 shrink-0 text-faint" />}
    </>
  );
  const cls = "flex min-h-[60px] w-full items-center gap-3 border-b border-line py-2 last:border-b-0";
  return href ? (
    <Link href={href} className={`${cls} rounded-[10px] hover:bg-well`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
