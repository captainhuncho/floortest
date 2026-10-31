import Link from "next/link";
import { Logo } from "./Logo";
import { CARD, Icon } from "./Kit";

/** A heading's anchor: lower-case words joined by dashes, so the contents list can link to each section. */
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * The frame every public reading page shares (legal pages, Trust, licenses, contact): light or dark with the
 * visitor's device, the mark at the top, one readable column, and a quiet foot with the way home. Layout only:
 * what each page says is its own.
 */
export function PublicShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="theme-system flex min-h-dvh flex-col bg-ink text-bone">
      <header className={`mx-auto flex w-full items-center justify-between gap-3 px-4 pb-2 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6 sm:pt-6 ${wide ? "max-w-[1040px]" : "max-w-[760px]"}`}>
        <Logo />
        <Link href="/contact" className="tap-text rounded-[11px] px-2 text-[12.5px] font-semibold text-mute hover:text-bone">
          Contact us
        </Link>
      </header>
      <main id="main" className={`mx-auto flex w-full flex-1 flex-col gap-4 px-4 pb-10 pt-4 sm:gap-5 sm:px-6 sm:pt-8 ${wide ? "max-w-[1040px]" : "max-w-[760px]"}`}>
        {children}
      </main>
      <footer className={`mx-auto w-full px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-6 ${wide ? "max-w-[1040px]" : "max-w-[760px]"}`}>
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-4 text-[11.5px] text-faint">
          <p>© {new Date().getFullYear()} FloorTest Labs</p>
          <nav aria-label="More" className="flex flex-wrap gap-x-4">
            <Link href="/" className="tap-text hover:text-bone">Home</Link>
            <Link href="/terms" className="tap-text hover:text-bone">Terms</Link>
            <Link href="/privacy" className="tap-text hover:text-bone">Privacy</Link>
            <Link href="/trust" className="tap-text hover:text-bone">Trust</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** A reading page's head card: a small label, the title, and what follows under it. */
export function DocHead({ label, title, children }: { label: React.ReactNode; title: string; children?: React.ReactNode }) {
  return (
    <header className={`${CARD} flex flex-col gap-2 p-4 sm:p-6`}>
      <p className="flex items-center gap-1.5 text-[11.5px] text-mute">{label}</p>
      <h1 className="text-[24px] font-semibold leading-tight tracking-[-0.03em] text-bone sm:text-[28px]">{title}</h1>
      {children}
    </header>
  );
}

/**
 * Built-in legal drafts. Replace with reviewed documents via TERMS_URL / PRIVACY_URL. The wording is the lawyer's and
 * comes in from each page untouched; this only sets it out: a head card, a contents list on wide screens (and folded on
 * phones) and the sections in one card, divided by hairlines. `bullets` sets the paragraphs as a list (Trust);
 * `note` replaces the beta draft note (null for none).
 */
export function LegalPage({
  title,
  updated,
  sections,
  label = "Legal",
  intro,
  note,
  bullets = false,
}: {
  title: string;
  updated?: string;
  sections: [string, string[]][];
  label?: string;
  intro?: string;
  note?: string | null;
  bullets?: boolean;
}) {
  const ids = sections.map(([h], i) => `${slug(h) || "section"}-${i + 1}`);
  const contents = sections.length > 3 && (
    <ol className="flex flex-col">
      {sections.map(([h], i) => (
        <li key={ids[i]}>
          <a href={`#${ids[i]}`} className="tap-text flex min-h-9 items-center rounded-[9px] px-2 text-[12.5px] leading-snug text-mute hover:bg-well hover:text-bone">
            {h}
          </a>
        </li>
      ))}
    </ol>
  );
  return (
    <PublicShell wide={!!contents}>
      <div className={contents ? "grid grid-cols-1 gap-4 sm:gap-5 lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start" : "flex flex-col gap-4 sm:gap-5"}>
        {contents && (
          <nav aria-label="On this page" className="hidden lg:sticky lg:top-6 lg:block">
            <p className="px-2 pb-1 text-[11.5px] font-semibold text-faint">On this page</p>
            {contents}
          </nav>
        )}
        <div className="flex min-w-0 flex-col gap-4 sm:gap-5">
          <DocHead
            label={
              <>
                <Icon name="shield" className="size-[15px]" />
                {label}
                {updated && <span className="text-faint">· Last updated {updated}</span>}
              </>
            }
            title={title}
          >
            {intro && <p className="text-[13.5px] leading-6 text-mute">{intro}</p>}
            {note !== null && (
              <p role="note" className="mt-1 flex items-start gap-2 rounded-[11px] border border-line bg-well px-3 py-2.5 text-[12.5px] leading-5 text-mute">
                <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[#d98a2b]" />
                {note ?? "Draft for the private beta. It describes how FloorTest works today."}
              </p>
            )}
          </DocHead>
          {contents && (
            <details className={`${CARD} group px-4 lg:hidden`}>
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-[12.5px] font-semibold text-bone [&::-webkit-details-marker]:hidden">
                On this page
                <Icon name="plus" className="size-4 text-mute transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none" />
              </summary>
              <div className="-mx-2 pb-2">{contents}</div>
            </details>
          )}
          <article className={`${CARD} flex flex-col px-4 sm:px-6`}>
            {sections.map(([h, paras], i) => (
              <section key={ids[i]} aria-labelledby={ids[i]} className={`scroll-mt-6 py-5 sm:py-6 ${i ? "border-t border-line" : ""}`}>
                <h2 id={ids[i]} className="scroll-mt-6 text-[15px] font-semibold tracking-[-0.015em] text-bone">
                  {h}
                </h2>
                {bullets ? (
                  <ul className="mt-2.5 flex flex-col gap-2">
                    {paras.map((p) => (
                      <li key={p} className="flex gap-2.5 text-[13.5px] leading-6 text-mute">
                        <span aria-hidden className="mt-[10px] size-1 shrink-0 rounded-full bg-line-2" />
                        <span className="max-w-[68ch]">{p}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  paras.map((p) => (
                    <p key={p} className="mt-2.5 max-w-[68ch] text-[13.5px] leading-6 text-mute">
                      {p}
                    </p>
                  ))
                )}
              </section>
            ))}
          </article>
        </div>
      </div>
    </PublicShell>
  );
}
