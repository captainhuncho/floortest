import { switchOn } from "@/lib/switches";
import { botCheckKey } from "@/lib/turnstile";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { APP_URL } from "@/lib/mail";
import { footerGroups } from "@/lib/site";
import { HOME_SECTIONS, messages, pairs, sectionOrder, siteCopy, siteImageUrl, type HomeSection } from "@/lib/content";
import { siteEditor } from "@/lib/site-editor";
import { SectionFrame, SectionList, SiteEditor } from "@/components/SiteEditor";
import { editable } from "@/components/Editable";
import { mono, serif } from "./fonts";
import { HomePreview } from "./HomePreview";
import { Booth, COL, Fair, Thanks, Week } from "./HomeWeek";
import { ClaimBar, WarehouseLoop } from "./HomeLive";
import { ClaimBox } from "./ClaimBox";
import { WaitlistForm } from "./WaitlistForm";
import { NewsletterForm } from "./NewsletterForm";
import { RememberSource } from "@/components/SourceField";
import { CARD, Icon } from "@/components/Kit";

/** The one address search engines should use for the home page. */
export const metadata = { alternates: { canonical: "/" } };

const HOST = APP_URL.replace(/^https?:\/\//, "");

/** The receipt steps' icons, in order; their words come from Site content (journey_steps). */
const JOURNEY_ICONS = ["✓", "♪", "↓", "↩"];






export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  // All independent: one round trip's wait instead of four.
  const [user, sp, c, signupOpen, billing, botKey, editor] = await Promise.all([currentUser(), searchParams, siteCopy("home"), switchOn("open_signup"), switchOn("billing"), botCheckKey(), siteEditor()]);
  // Ops staff editing on the page get typeable text; everyone else gets plain text (at any size picked in the editor).
  const ed = editable(c, !!editor);
  const { E, panel } = ed;
  const order = sectionOrder(c.sections);
  const deleted = !!sp.deleted;
  const HOW = pairs(c.how_steps);
  const FAQ = pairs(c.faq);
  const JOURNEY = pairs(c.journey_steps);
  const PRIVATE = pairs(c.private_points);
  // Invite-only: most visitors have no code, so the main button leads to the waitlist.
  const inviteOnly = !signupOpen;
  const cta = user
    ? { href: "/dashboard/floor", label: "Open your desk" }
    : inviteOnly
      ? { href: "#waitlist", label: "Request an invite" }
      : { href: "/signup", label: "Claim your link" };

  const SECTIONS: Record<HomeSection, React.ReactNode> = {
    week: <Week c={c} {...ed} host={HOST} />,
    booth: <Booth c={c} {...ed} />,
    receipt: <Thanks c={c} {...ed} />,
    fair: <Fair c={c} {...ed} />,
    end: (
      <section aria-labelledby="end-title" className={`${COL} pb-10 pt-14 min-[900px]:flex min-[900px]:flex-col min-[900px]:items-center min-[900px]:pb-16 min-[900px]:pt-24 min-[900px]:text-center`}>
        <h2 id="end-title" className="mb-[18px] text-balance text-[28px] font-semibold leading-[1.1] tracking-[-0.03em] min-[900px]:text-[40px]"><E k="end_title" /></h2>
        {user ? (
          <Link href="/dashboard/floor" className="h1e-fill inline-flex min-h-[52px] items-center rounded-full px-5 text-base font-semibold">
            Open your desk
          </Link>
        ) : (
          <ClaimBox host={HOST} inviteOnly={inviteOnly} end />
        )}
      </section>
    ),
    preview: (
      <section data-edit-image={editor ? "preview_image" : undefined} className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        {c.preview_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={siteImageUrl(c.preview_image)} alt={c.preview_alt} loading="lazy" decoding="async" className="w-full rounded-[18px] border border-line" />
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="home-label"><E k="preview_label" /></p>
              <p className="home-label"><E k="preview_hint" /></p>
            </div>
            <HomePreview host={HOST} />
          </>
        )}
      </section>
  ),
    how: (
      <section id="how" className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
        <h2 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
          <E k="how_title" />
        </h2>
        <ol {...panel("how_steps", "Each step: a title line, then its text. Leave a blank line between steps.")} className={`${CARD} mt-8 grid grid-cols-1 overflow-hidden sm:grid-cols-2`}>
          {HOW.map(([title, body], i) => (
            <li
              key={title}
              className={`border-line p-5 sm:p-6 ${i ? "border-t sm:border-l sm:border-t-0" : ""}`}
            >
              <p className="home-label">0{i + 1}</p>
              <p className="mt-4 text-[17px] font-semibold tracking-[-0.015em]">{title}</p>
              <p className="mt-2 max-w-[65ch] text-[13.5px] leading-6 text-mute">
                {body}
              </p>
            </li>
          ))}
        </ol>
      </section>
  ),
    journey: (
      <section className="border-y border-line bg-ink-2">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-end">
            <h2 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
              <E k="journey_title" />
            </h2>
            <p className="max-w-[65ch] text-sm leading-relaxed text-mute lg:pb-2">
              <E k="journey_intro" />
            </p>
          </div>
          <ol {...panel("journey_steps", "Each step: a title line, then its text. Leave a blank line between steps. The icons stay in order (four).")} className={`${CARD} mt-8 grid grid-cols-1 overflow-hidden sm:grid-cols-2 lg:grid-cols-4`}>
            {JOURNEY.map(([title, body], i) => (
              <li
                key={title}
                className={`flex gap-3.5 border-line p-5 sm:p-6 ${i ? "border-t sm:border-t-0 sm:border-l" : "bg-well"} ${i === 2 ? "sm:border-l-0 sm:border-t lg:border-t-0 lg:border-l" : ""} ${i === 3 ? "sm:border-t lg:border-t-0" : ""}`}
              >
                <span
                  aria-hidden
                  className={`grid size-9 shrink-0 place-items-center rounded-[11px] border border-line bg-well text-[15px] ${i ? "text-faint" : "text-lime"}`}
                >
                  {JOURNEY_ICONS[i] ?? "·"}
                </span>
                <span>
                  <span className="block text-[13px] font-semibold text-bone">
                    {title}
                  </span>
                  <span className="mt-1 block text-[12px] leading-5 text-mute">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>
  ),
    private: (
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
              <E k="private_title" />
            </h2>
          </div>
          <dl {...panel("private_points", "Each point: a title line, then its text. Leave a blank line between points.")} className={`${CARD} divide-y divide-line px-5 sm:px-6`}>
            {PRIVATE.map(([k, v]) => (
              <div key={k} className="py-5">
                <dt className="text-[13px] font-semibold text-bone">
                  {k}
                </dt>
                <dd className="mt-1 text-[13px] leading-6 text-mute">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
  ),
    plans: (
      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <p className="home-label"><E k="plans_kicker" /></p>
        <h2 className="mt-3 text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.035em]"><E k={billing ? "plans_title_launch" : "plans_title"} /></h2>
        <p className="mx-auto mt-4 max-w-xl text-[14px] leading-6 text-mute"><E k={billing ? "plans_intro_launch" : "plans_intro"} /></p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href={cta.href} className="inline-flex min-h-11 items-center rounded-[13px] border border-line bg-well px-5 text-[13px] font-semibold text-bone hover:border-line-2">
            {cta.label}
          </Link>
          <Link href="/pricing" className="inline-flex min-h-11 items-center px-2 text-[13px] text-mute underline-offset-4 hover:text-bone hover:underline">
            <E k="plans_compare" />
          </Link>
        </div>
      </section>
  ),
    waitlist: !user ? (
      <section id="waitlist" className={`${COL} scroll-mt-24 py-14 sm:py-16`}>
          <div className={`${CARD} grid grid-cols-1 gap-8 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-10`}>
            <div>
              <h2 className="text-[clamp(1.6rem,3vw,2.25rem)] font-semibold leading-[1.05] tracking-[-0.03em]"><E k="waitlist_title" /></h2>
              <p className="mt-4 text-sm leading-relaxed text-mute">
                <E k="waitlist_intro" />
              </p>
            </div>
            <WaitlistForm host={HOST} botCheckKey={botKey} />
          </div>
        </section>
      ) : null
,
    faq: (
      <section className={`${COL} py-16`}>
        <h2 className="text-[clamp(1.75rem,3.4vw,2.5rem)] font-semibold leading-[1.05] tracking-[-0.035em]">
          <E k="faq_title" />
        </h2>
        <div {...panel("faq", "Each question on its own line, the answer below it. Leave a blank line between questions.")} className={`${CARD} mt-8 px-5 sm:px-6`}>
          {FAQ.map(([q, a], i) => (
            <details
              key={q}
              open={i === 0}
              className={`group ${i ? "border-t border-line" : ""}`}
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 py-3 text-[14px] font-semibold [&::-webkit-details-marker]:hidden">
                {q}
                <Icon name="plus" className="size-4 text-mute transition-transform duration-150 group-open:rotate-45 motion-reduce:transition-none" />
              </summary>
              <p className="max-w-[65ch] pb-5 text-[13.5px] leading-6 text-mute">
                {a}
              </p>
            </details>
          ))}
        </div>
      </section>
  ),
  };

  const page = (
    <div
      className={`${serif.variable} ${mono.variable} home-1e theme-system bg-ink text-bone`}
    >
      <RememberSource />
      <div className={COL}>
        {deleted && (
          <p
            role="status"
            className={`${CARD} mt-6 px-4 py-3 text-[13px]`}
          >
            Your account and everything in it have been deleted. Thanks for
            trying FloorTest.
          </p>
        )}
      </div>
      {/* Stays at the top while scrolling. */}
      <div className="sticky top-0 z-40 border-b border-line bg-ink/85 pt-[env(safe-area-inset-top)] backdrop-blur">
        <header className={`${COL} flex min-h-14 items-center justify-between gap-3 min-[900px]:min-h-[68px]`}>
          <Logo />
          <nav aria-label="Main" className="flex shrink-0 items-center gap-1 whitespace-nowrap">
            <a href="#week" className="hidden min-h-11 items-center px-3 text-[15px] text-mute hover:text-bone min-[900px]:inline-flex">
              <E k="nav_how" />
            </a>
            <Link href="/pricing" className="hidden min-h-11 items-center px-3 text-[15px] text-mute hover:text-bone min-[900px]:inline-flex">
              <E k="nav_plans" />
            </Link>
            {user ? (
              <Link href="/dashboard/floor" className="h1e-fill ml-2 inline-flex min-h-11 items-center rounded-full px-[18px] text-[15px] font-semibold">
                Open your desk
              </Link>
            ) : (
              <>
                <Link href="/login" className="inline-flex min-h-11 items-center px-1 text-[15px] text-mute hover:text-bone min-[900px]:px-3">
                  Log in
                </Link>
                {/* Phones have the claim box on screen and then the claim bar; the header's button is for the wide page. */}
                <a href="#hero" className="h1e-fill ml-2 hidden min-h-11 items-center rounded-full px-[18px] text-[15px] font-semibold min-[900px]:inline-flex">
                  Claim your link
                </a>
              </>
            )}
          </nav>
        </header>
      </div>

      {/* Hero: the promise and the claim box; beside it (under it on phones) the noise it replaces, on a loop. */}
      <section id="hero" aria-labelledby="hero-title" className={`${COL} scroll-mt-20 pb-2 pt-[18px] min-[900px]:pb-10 min-[900px]:pt-6`}>
        <div className="min-[900px]:grid min-[900px]:min-h-[620px] min-[900px]:grid-cols-2 min-[900px]:items-center min-[900px]:gap-16">
          <div className="min-w-0">
            <h1 id="hero-title" className="text-balance text-[31px] font-semibold leading-[1.08] tracking-[-0.035em] min-[900px]:text-[50px]">
              <E k="headline" />
              <span className="block font-[family-name:var(--font-serif)] text-[1.08em] font-normal italic tracking-[-0.01em]">
                <E k="headline_italic" />
              </span>
            </h1>
            <p className="mt-3 max-w-[30em] text-base text-mute min-[900px]:text-lg">
              <E k="intro" />
            </p>
            <div className="mt-[18px]">
              {user ? (
                <div className={`${CARD} min-w-0 p-5 min-[900px]:max-w-[520px]`}>
                  <p className="home-label"><E k="hero_your_link" /></p>
                  <p className="mt-3 break-all text-xl sm:text-2xl">
                    <span className="text-mute">{HOST}/</span><wbr />{user.handle}
                  </p>
                  <Link href="/dashboard/floor" className="h1e-fill mt-4 inline-flex min-h-[52px] items-center rounded-full px-5 text-base font-semibold">
                    Open your desk
                  </Link>
                </div>
              ) : (
                <>
                  <ClaimBox host={HOST} inviteOnly={inviteOnly} />
                  <p className="mt-1.5 text-[13px] text-mute">
                    <E k="hero_beta" />
                    {inviteOnly && (
                      <>
                        {" "}· <Link href="/signup" className="inline-flex min-h-11 items-center text-bone underline underline-offset-[3px]"><E k="hero_invite_link" /></Link>
                      </>
                    )}
                  </p>
                </>
              )}
            </div>
          </div>
          <div {...panel("loop_messages", "One message per line. Add \" | m\" after a message to set it in the mono type. Eleven fit; keep each one short.")} className="mt-[22px] min-[900px]:mt-0">
            <WarehouseLoop messages={messages(c.loop_messages)} />
          </div>
        </div>
      </section>

      {/* Sections below the hero: order and visibility come from Site content (draggable when editing on the page). */}
      <SectionList>
        {order.filter((x) => editor || !x.hidden).map((x) => (
          <SectionFrame key={x.id} id={x.id}>
            {SECTIONS[x.id]}
          </SectionFrame>
        ))}
      </SectionList>

      {/* Desktop: brand + newsletter left, links right; reference legal pages in a small bottom row. */}
      <footer className={`${COL} hidden pb-10 pt-12 text-sm text-mute lg:block`}>
        <div className="grid grid-cols-12 gap-8 border-t border-line pt-10">
          <div className="col-span-5">
            <Logo />
            <p className="mt-3 max-w-xs"><E k="footer_line" /></p>
            <div className="mt-8 max-w-md">
              <p className="mb-3 text-sm font-bold text-bone"><E k="newsletter_title" /></p>
              <NewsletterForm botCheckKey={botKey} />
            </div>
          </div>
          <nav aria-label="Footer" className="col-span-7 grid grid-cols-3 gap-x-6 pl-8">
            {footerGroups().map((g) => (
              <div key={g.title}>
                <h2 className="text-[11px] font-bold uppercase tracking-[1.5px] text-bone">{g.title}</h2>
                <ul className="mt-3 grid gap-y-1">
                  {(g.title === "Legal" ? g.links.slice(0, LEGAL_MAIN) : g.links).map((l) => (
                    <li key={l.label}>
                      {l.external ? (
                        <a href={l.href} target="_blank" rel="noreferrer" className="inline-block py-1.5 hover:text-bone">
                          {l.label}
                        </a>
                      ) : (
                        <Link href={l.href} className="inline-block py-1.5 hover:text-bone">
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
        <div className="mt-10 flex items-center justify-between gap-3 border-t border-line pt-6 text-xs text-dim">
          <p>© {new Date().getFullYear()} FloorTest Labs. <E k="footer_note" /></p>
          <ul className="flex flex-wrap gap-x-4">
            {(footerGroups().find((g) => g.title === "Legal")?.links.slice(LEGAL_MAIN) ?? []).map((l) => (
              <li key={l.label}>
                <Link href={l.href} className="inline-block py-1.5 hover:text-bone">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </footer>

      {/* Phones and tablets. */}
      <footer className={`${COL} pt-12 text-sm text-mute lg:hidden ${user ? "pb-10" : "pb-[calc(110px+env(safe-area-inset-bottom))] min-[900px]:pb-10"}`}>
        <div className="flex flex-col gap-3 border-t border-line pt-10 sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <p className="max-w-xs"><E k="footer_line" /></p>
        </div>
        <div className="mt-8 max-w-md">
          <p className="mb-3 text-sm font-bold text-bone"><E k="newsletter_title" /></p>
          <NewsletterForm botCheckKey={botKey} />
        </div>
        <nav aria-label="Footer" className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
          {footerGroups().map((g) => (
            <div key={g.title} className={g.title === "Legal" ? "col-span-2 sm:col-span-1" : ""}>
              <h2 className="text-[11px] font-bold uppercase tracking-[1.5px] text-bone">{g.title}</h2>
              {/* Legal is the long list: two columns on phones so it doesn't run down the screen. */}
              <ul className={`mt-3 grid gap-y-1 ${g.title === "Legal" ? "grid-cols-2 gap-x-6 sm:grid-cols-1" : ""}`}>
                {g.links.map((l) => (
                  <li key={l.label}>
                    {l.external ? (
                      <a href={l.href} target="_blank" rel="noreferrer" className="inline-block py-1.5 hover:text-bone">
                        {l.label}
                      </a>
                    ) : (
                      <Link href={l.href} className="inline-block py-1.5 hover:text-bone">
                        {l.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <p className="mt-10 border-t border-line pt-6 text-xs text-dim">© {new Date().getFullYear()} FloorTest Labs. <E k="footer_note" /></p>
      </footer>
      {!user && <ClaimBar host={HOST} />}
    </div>
  );

  return editor ? (
    <SiteEditor page="home" label="Home" values={c} initialOrder={order} labels={HOME_SECTIONS}>
      {page}
    </SiteEditor>
  ) : (
    page
  );
}

// Desktop footer: the first four legal links stay in the Legal column; the rest go in the bottom row.
const LEGAL_MAIN = 4;
