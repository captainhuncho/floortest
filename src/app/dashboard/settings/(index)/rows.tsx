import Link from "next/link";
import { Icon } from "@/components/Kit";

/**
 * The Settings page's small parts (option 47): a labelled group is one flat card of rows, each row 56px tall with a
 * quiet icon, a title, one line under it and whatever sits on the right. Server-safe: no hooks.
 */

/** The rows' icons, as drawn for option 47: a 24px grid, 2px round strokes, shown at 20px. */
const GLYPHS = {
  contacts: <><circle cx="9" cy="8" r="3.5" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6M16 4.5a3.5 3.5 0 010 7M21 20c0-2.6-1.6-4.8-4-5.6" /></>,
  played: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  card: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /></>,
  pause: <><circle cx="12" cy="12" r="9" /><path d="M10 9v6M14 9v6" /></>,
  theme: <path d="M20 14A8 8 0 0110 4a8 8 0 1010 10z" />,
  shield: <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />,
  person: <><circle cx="12" cy="8" r="3.5" /><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" /></>,
  bell: <path d="M6 16V11a6 6 0 0112 0v5l2 2H4zM10 21h4" />,
  key: <><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M16 7l3 3" /></>,
  swap: <path d="M7 7h12l-3-3M17 17H5l3 3" />,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 015 .5c0 1.5-2.5 2-2.5 3.5M12 17h.01" /></>,
  gift: <path d="M12 8v13M4 12h16v9H4zM3 8h18v4H3zM12 8c-2-4-6-3-5 0M12 8c2-4 6-3 5 0" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 018 0v4" /></>,
  out: <path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11" />,
} as const;
export type GlyphName = keyof typeof GLYPHS;

export function Glyph({ name, className = "size-5 text-mute" }: { name: GlyphName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {GLYPHS[name]}
    </svg>
  );
}

/** A row's box: shared by links, buttons and the rows that hold a control. */
export const ROW = "flex min-h-14 w-full items-center gap-3 border-b border-line py-2 text-left last:border-b-0";
/** Rows you can press: the focus ring follows the row's shape. */
export const ROW_PRESS = `${ROW} rounded-[10px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime`;

/** The icon, title and line under it that every row starts with. */
export function RowText({ icon, title, sub }: { icon: GlyphName; title: string; sub?: React.ReactNode }) {
  return (
    <>
      <Glyph name={icon} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold text-bone">{title}</span>
        {sub && <span className="block truncate text-[13px] text-mute">{sub}</span>}
      </span>
    </>
  );
}

/** A row that opens a page. `external` pages open in a new tab and say so. */
export function Row({ href, icon, title, sub, value, external, className = "" }: { href: string; icon: GlyphName; title: string; sub?: React.ReactNode; value?: React.ReactNode; external?: boolean; className?: string }) {
  return (
    <Link href={href} target={external ? "_blank" : undefined} rel={external ? "noopener" : undefined} className={`${ROW_PRESS} ${className}`}>
      <RowText icon={icon} title={title} sub={sub} />
      {value}
      {external ? (
        <>
          <svg viewBox="0 0 24 24" aria-hidden className="size-4 shrink-0 text-mute" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
          </svg>
          <span className="sr-only">(opens in a new tab)</span>
        </>
      ) : (
        <Icon name="chev" className="size-4 text-mute" />
      )}
    </Link>
  );
}

/** A labelled group: a small caps label over one card of rows. */
export function Group({ id, label, className = "", children }: { id: string; label: string; className?: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={className}>
      <h2 id={id} className="mx-1 mb-1.5 mt-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-mute">
        {label}
      </h2>
      <div className="flex flex-col rounded-2xl bg-card px-3.5">{children}</div>
    </section>
  );
}
