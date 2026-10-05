import { switchOn } from "@/lib/switches";
import { botCheckKey } from "@/lib/turnstile";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { APP_URL } from "@/lib/mail";
import { env } from "@/lib/env";
import { footerGroups } from "@/lib/site";
import { pairs, siteCopy, siteImageUrl } from "@/lib/content";
import { mono, serif } from "./fonts";
import { HomePreview } from "./HomePreview";
import { ClaimBox } from "./ClaimBox";
import { WaitlistForm } from "./WaitlistForm";
import { RememberSource } from "@/components/SourceField";

/** The one address search engines should use for the home page. */
export const metadata = { alternates: { canonical: "/" } };

const HOST = APP_URL.replace(/^https?:\/\//, "");
const DEMO = "/maxwell";

const JOURNEY = [
  ["✓", "Delivered", "Original audio received safely"],
  ["♪", "Listened", "Played for 30+ seconds"],
  ["↓", "Downloaded", "The original file was downloaded"],
  ["↩", "Replied", "A message came back"],
];






export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const user = await currentUser();
  const deleted = !!(await searchParams).deleted;
  const c = await siteCopy("home");
  const HOW = pairs(c.how_steps);
  const FAQ = pairs(c.faq);
  // Invite-only: most visitors have no code, so the main button leads to the waitlist.
  const inviteOnly = !(await switchOn("open_signup"));
  const billing = await switchOn("billing");
  const cta = user
    ? { href: "/dashboard/floor", label: "Open your desk" }
    : inviteOnly
      ? { href: "#waitlist", label: "Request an invite" }
      : { href: "/signup", label: "Claim your link" };

  return (
    <div
      className={`${serif.variable} ${mono.variable} bg-ink text-bone`}
    >
      <RememberSource />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {deleted && (
          <p
            role="status"
            className="mt-6 rounded-lg border border-line bg-ink-2 px-4 py-3 text-sm"
          >
            Your account and everything in it have been deleted. Thanks for
            trying FloorTest.
          </p>
        )}
        <header className="flex items-center justify-between gap-3 py-6">
          <Logo />
          <nav className="flex shrink-0 items-center gap-2 whitespace-nowrap">
            {user ? (
              <Link href="/dashboard/floor" className="btn-lime btn-sm">
                Open desk
              </Link>
            ) : (
              <>
                <Link href="/pricing" className="hidden px-2 text-sm text-mute hover:text-bone sm:inline">
                  Pricing
                </Link>
                <Link href="/login" className="btn-ghost btn-sm">
                  Log in
                </Link>
                <Link href={cta.href} className="btn-lime btn-sm">
                  {inviteOnly ? (
                    <>
                      {/* Narrow phones: the short label, so the header stays on one line. */}
                      <span className="sm:hidden">Get invite</span>
                      <span className="hidden sm:inline">Request an invite</span>
                    </>
                  ) : (
                    "Get your link"
                  )}
                </Link>
              </>
            )}
          </nav>
        </header>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-6 sm:pt-24">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center">
            <div>
              <p className="flex items-center gap-3 text-sm text-lime">
                <span aria-hidden className="h-px w-8 bg-lime" /> {c.eyebrow}
              </p>
              <h1 className="mt-6 text-[clamp(3rem,7.5vw,6.5rem)] font-bold leading-[0.9] tracking-[-0.045em]">
                {c.headline}
                <span className="block font-[family-name:var(--font-serif)] font-normal italic tracking-[-0.02em] text-mute">
                  {c.headline_italic}
                </span>
              </h1>
              <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-mute">
                {c.intro}
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-6">
                <Link
                  href={cta.href}
                  className="rounded-md bg-lime px-6 py-4 text-sm font-medium uppercase text-ink hover:brightness-95"
                >
                  {cta.label} →
                </Link>
                <Link
                  href={DEMO}
                  className="text-sm text-bone hover:text-bone"
                >
                  See an example link <span className="text-dim">(example: /maxwell)</span> →
                </Link>
              </div>
              {!user && (
                <p className="mt-4 text-xs text-dim">
                  Private beta · invites go out in small batches to DJs, curators and labels
                  {inviteOnly && (
                    <>
                      {" "}· <Link href="/signup" className="underline underline-offset-4 hover:text-bone">Have an invite? Claim your link</Link>
                    </>
                  )}
                </p>
              )}
            </div>
            {/* The one link, and where it routes: the product in a card. */}
            <div className="min-w-0 rounded-lg border border-white/10 bg-ink-2 p-6 sm:p-8">
              {user ? (
                <>
                  <p className="home-label">Your link</p>
                  <p className="mt-4 break-all text-xl sm:text-2xl">
                    {HOST}/<wbr /><span className="text-lime">{user.handle}</span>
                  </p>
                </>
              ) : (
                <ClaimBox host={HOST} inviteOnly={inviteOnly} />
              )}
              <p className="home-label mt-6 normal-case tracking-normal">Same link. You choose where it routes.</p>
              <div className="mt-3 space-y-2">
                <div className="flex items-center justify-between rounded-md border border-white/10 px-4 py-2.5 text-xs text-mute">
                  <span>Yesterday</span>
                  <span>Friday residency</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-lime/50 bg-lime/[0.08] px-4 py-2.5 text-xs">
                  <span className="text-mute">Today</span>
                  <span className="font-semibold text-lime">Radio show callout</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Product preview */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        {c.preview_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={siteImageUrl(c.preview_image)} alt={c.preview_alt} className="w-full rounded-lg border border-white/10" />
        ) : (
          <>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.12em] text-lime">
                [Live product preview]
              </p>
              <p className="home-label">Click a track</p>
            </div>
            <HomePreview host={HOST} />
          </>
        )}
      </section>

      {/* How */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[0.95] tracking-[-0.04em]">
          {c.how_title}
        </h2>
        <ol className="mt-10 grid grid-cols-1 border-t border-white/10 sm:grid-cols-2">
          {HOW.map(([title, body], i) => (
            <li
              key={title}
              className={`border-white/10 py-8 pr-6 ${i ? "sm:border-l sm:pl-6" : ""}`}
            >
              <p className="home-label">0{i + 1}</p>
              <p className="mt-8 text-xl">{title}</p>
              <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-mute">
                {body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Journey */}
      <section className="border-y border-white/10 bg-ink-2">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-end">
            <h2 className="text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold leading-[0.95] tracking-[-0.04em]">
              {c.journey_title}
            </h2>
            <p className="max-w-[65ch] text-sm leading-relaxed text-mute lg:pb-2">
              {c.journey_intro}
            </p>
          </div>
          <ol className="mt-10 grid grid-cols-1 overflow-hidden rounded-lg border border-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {JOURNEY.map(([icon, title, body], i) => (
              <li
                key={title}
                className={`flex gap-4 border-white/10 p-6 ${i ? "border-t sm:border-t-0 sm:border-l" : "bg-lime/[0.06]"} ${i === 2 ? "sm:border-l-0 sm:border-t lg:border-t-0 lg:border-l" : ""} ${i === 3 ? "sm:border-t lg:border-t-0" : ""}`}
              >
                <span
                  aria-hidden
                  className={`text-xl ${i ? "text-dim" : "text-lime"}`}
                >
                  {icon}
                </span>
                <span>
                  <span className="block text-sm uppercase">
                    {title}
                  </span>
                  <span className="mt-1 block text-xs text-mute">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Private by design */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div>
            <h2 className="text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[0.95] tracking-[-0.04em]">
              {c.private_title}
            </h2>
          </div>
          <dl className="divide-y divide-white/10 border-y border-white/10">
            {[
              [
                "Your decisions stay yours",
                "Senders see listens, downloads and replies. Keep and not-for-me calls are never shared.",
              ],
              [
                "You control intake",
                "Pause your link while touring, set closing dates per callout, and block anyone.",
              ],
              [
                "Clear retention",
                "Undecided tracks are deleted after 90 days, tracks marked “Not for me” 30 days after you mark them. Kept tracks stay until you delete them.",
              ],
            ].map(([k, v]) => (
              <div key={k} className="py-5">
                <dt className="text-xs uppercase tracking-[0.1em] text-lime">
                  {k}
                </dt>
                <dd className="mt-2 text-sm text-mute">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Plans */}
      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <p className="text-sm uppercase tracking-[0.2em] text-mute">{c.plans_kicker}</p>
        <h2 className="mt-5 text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[1] tracking-[-0.04em]">{billing ? c.plans_title_launch : c.plans_title}</h2>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-mute sm:text-lg">{billing ? c.plans_intro_launch : c.plans_intro}</p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link href={cta.href} className="rounded-full bg-lime px-8 py-4 text-base font-semibold text-ink hover:brightness-95">
            {user ? "Open your desk" : inviteOnly ? "Request an invite" : "Start free"}
          </Link>
          <Link href="/pricing" className="rounded-full border border-line-2 bg-ink-2 px-8 py-4 text-base font-semibold text-bone hover:border-mute">
            Compare all plans
          </Link>
        </div>
      </section>

      {/* Waitlist */}
      {!user && (
        <section id="waitlist" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid grid-cols-1 gap-10 rounded-lg border border-white/10 bg-ink-2 p-6 sm:p-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <h2 className="text-[clamp(2rem,4vw,3.25rem)] font-bold leading-[0.95] tracking-[-0.035em]">No invite yet?</h2>
              <p className="mt-4 text-sm leading-relaxed text-mute">
                We&apos;re letting DJs, labels and curators in a few at a time. Leave your details and you&apos;ll get a personal invite by email.
              </p>
            </div>
            <WaitlistForm host={HOST} botCheckKey={await botCheckKey()} />
          </div>
        </section>
      )}

      {/* FAQ */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[0.95] tracking-[-0.04em]">
          {c.faq_title}
        </h2>
        <div className="mt-10 border-t border-white/10">
          {FAQ.map(([q, a], i) => (
            <details
              key={q}
              open={i === 0}
              className="group border-b border-white/10"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between py-5 font-semibold">
                {q}
                <span
                  aria-hidden
                  className="text-xl text-lime group-open:hidden"
                >
                  +
                </span>
                <span
                  aria-hidden
                  className="hidden text-xl text-lime group-open:inline"
                >
                  −
                </span>
              </summary>
              <p className="max-w-[65ch] pb-6 text-sm leading-relaxed text-mute">
                {a}
              </p>
            </details>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-4 pb-10 pt-12 text-sm text-mute sm:px-6">
        <div className="flex flex-col gap-3 border-t border-line pt-10 sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <p className="max-w-xs">Built for DJs and curators who receive music every week.</p>
        </div>
        <nav aria-label="Footer" className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
          {footerGroups().map((g) => (
            <div key={g.title} className={g.title === "Legal" ? "col-span-2 sm:col-span-1" : ""}>
              <h2 className="text-[11px] font-bold uppercase tracking-[1px] text-faint">{g.title}</h2>
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
        <p className="mt-10 border-t border-line pt-6 text-xs text-dim">© {new Date().getFullYear()} FloorTest. Private beta.</p>
      </footer>
    </div>
  );
}
