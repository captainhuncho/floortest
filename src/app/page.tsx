import { switchOn } from "@/lib/switches";
import { botCheckKey } from "@/lib/turnstile";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { APP_URL } from "@/lib/mail";
import { env } from "@/lib/env";
import { PLANS } from "@/lib/plans";
import { footerLinks } from "@/lib/site";
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

const HOW = [
  ["Share your link", "Post it once: in your bio, a callout, a DM. Senders upload the original file, no account needed."],
  ["Route by callout", "Each callout gets its own collection. Switch where new tracks land in one click."],
  ["Decide fast", "Play, then Keep or Not for me, and the next track is already up. Reply without leaving the queue."],
  ["Take it to the booth", "Kept tracks download as one crate with a Rekordbox XML and playlist, or just the files."],
];

const FAQ = [
  [
    "Do senders need an account?",
    "No. They send through a receiver's link with their name and email, confirm the email once, and get a private receipt link to follow the track.",
  ],
  [
    "What files can be submitted?",
    "The original WAV or MP3, up to 250 MB. No streaming or cloud links: the receiver gets the actual file.",
  ],
  [
    "Does your link change?",
    "Never. It stays the same while you route new tracks into whichever collection is receiving, or pause it while you're away.",
  ],
  [
    'What counts as "listened"?',
    "At least 30 seconds of real playback, or a quarter of a short track. Skipping around doesn't count, so the signal means something.",
  ],
  [
    "Is it free?",
    "Yes, for up to 20 active tracks, and free for good at that size. During the beta, Pro and Team are free too, and sign-up is by invite.",
  ],
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const user = await currentUser();
  const deleted = !!(await searchParams).deleted;
  // Invite-only: most visitors have no code, so the main button leads to the waitlist.
  const inviteOnly = !(await switchOn("open_signup"));
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
        <header className="flex items-center justify-between py-6">
          <Logo />
          <nav className="flex items-center gap-2">
            {user ? (
              <Link href="/dashboard/floor" className="btn-lime btn-sm">
                Open desk
              </Link>
            ) : (
              <>
                <Link href="/login" className="btn-ghost btn-sm">
                  Log in
                </Link>
                <Link href={cta.href} className="btn-lime btn-sm">
                  {inviteOnly ? "Request an invite" : "Get your link"}
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
              <p className="flex items-center gap-3 text-xs uppercase tracking-[0.12em] text-lime">
                <span aria-hidden className="h-px w-8 bg-lime" /> The receiving
                desk for unreleased music
              </p>
              <h1 className="mt-6 text-[clamp(3rem,7.5vw,6.5rem)] font-bold leading-[0.9] tracking-[-0.045em]">
                From private tracks
                <span className="block font-[family-name:var(--font-serif)] font-normal italic tracking-[-0.02em] text-mute">
                  to the DJ set.
                </span>
              </h1>
              <p className="mt-8 max-w-2xl text-[15px] leading-relaxed text-mute">
                One permanent link for every demo you&apos;re sent. Hear what&apos;s
                new in seconds, keep what's right for your set, and answer every
                sender without a single DM.
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
                  See a demo link <span className="text-dim">(example: /maxwell)</span> →
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
              <p className="home-label mt-6">Same link. You choose where it routes.</p>
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
          <div className="mt-20 flex flex-wrap gap-x-8 gap-y-2 border-t border-white/10 pt-6">
            {["No account needed to send", "Original WAV & MP3", "Change any decision later"].map((t) => (
              <span key={t} className="home-label flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-md bg-lime" />
                {t}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Journey */}
      <section className="border-y border-white/10 bg-ink-2">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <p className="text-xs uppercase tracking-[0.12em] text-lime">
            [One private track · a visible journey]
          </p>
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-end">
            <h2 className="text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold leading-[0.95] tracking-[-0.04em]">
              Know what happened next.
            </h2>
            <p className="text-sm leading-relaxed text-mute lg:pb-2">
              FloorTest records the four moments that matter between sending a
              track and hearing back.
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
                  <span className="mt-1 block text-xs text-dim">
                    {body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Product preview */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.12em] text-lime">
            [Live product preview]
          </p>
          <p className="home-label">Click a track</p>
        </div>
        <HomePreview host={HOST} />
      </section>

      {/* Why */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="text-xs uppercase tracking-[0.12em] text-lime">
          [Why FloorTest]
        </p>
        <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-end">
          <h2 className="text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold leading-[0.95] tracking-[-0.04em]">
            Stop receiving music everywhere.
          </h2>
          <p className="text-sm leading-relaxed text-mute lg:pb-2">
            One private workflow replaces scattered inboxes, expired links and
            missing context.
          </p>
        </div>
        <div className="mt-10 grid grid-cols-1 md:grid-cols-2">
          <div className="border border-white/10 bg-ink-2 p-8 sm:p-10">
            <p className="home-label">The old way</p>
            <p className="mt-6 text-2xl sm:text-3xl">DMs, email and drives</p>
            <ul className="mt-8 divide-y divide-white/10 border-t border-white/10 text-sm text-mute">
              {[
                "Links expire before listening",
                "Files lose sender context",
                "Feedback disappears in chats",
                "Artists never know what happened",
              ].map((t) => (
                <li key={t} className="py-3.5">
                  <span className="mr-3 text-lime">→</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="bg-lime p-8 text-ink sm:p-10">
            <p className="text-[0.7rem] uppercase tracking-[0.1em]">
              With FloorTest
            </p>
            <p className="mt-6 text-2xl sm:text-3xl">One receiving desk</p>
            <ul className="mt-8 divide-y divide-ink/15 border-t border-ink/15 text-sm">
              {[
                "Original audio, ready to download",
                "Every track routed into a collection",
                "Replies stay attached to submissions",
                "Senders hear when it's listened to, downloaded or replied to",
              ].map((t) => (
                <li key={t} className="py-3.5">
                  <span className="mr-3">→</span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="text-xs uppercase tracking-[0.12em] text-lime">
          [How FloorTest works]
        </p>
        <h2 className="mt-4 text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[0.95] tracking-[-0.04em]">
          Share once. Decide fast.
        </h2>
        <ol className="mt-10 grid grid-cols-1 border-t border-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {HOW.map(([title, body], i) => (
            <li
              key={title}
              className={`border-white/10 py-8 pr-6 ${i ? "lg:border-l lg:pl-6" : ""} ${i % 2 ? "sm:border-l sm:pl-6" : ""}`}
            >
              <p className="home-label">0{i + 1}</p>
              <p className="mt-8 text-xl">{title}</p>
              <p className="mt-3 text-sm leading-relaxed text-mute">
                {body}
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-12 grid grid-cols-1 overflow-hidden rounded-lg border border-white/10 md:grid-cols-2">
          <div className="bg-ink-2 p-6 sm:p-12">
            <p className="text-xs uppercase tracking-[0.1em] text-lime">
              For DJs, curators and labels
            </p>
            <p className="mt-8 text-[clamp(2rem,4vw,3.25rem)] font-bold leading-[0.95] tracking-[-0.035em]">
              Every demo in one place.
            </p>
            <p className="mt-5 text-sm leading-relaxed text-mute">
              Every demo in one queue, sorted by callout, ready to play. No more
              digging through DMs, inboxes and expired links before a gig.
            </p>
            <Link
              href={cta.href}
              className="mt-8 inline-block rounded-md bg-lime px-6 py-3.5 text-sm font-medium uppercase text-ink"
            >
              {cta.label} →
            </Link>
          </div>
          <div className="border-t border-white/10 bg-ink-2 p-6 sm:p-12 md:border-l md:border-t-0">
            <p className="text-xs uppercase tracking-[0.1em] text-lime">
              For artists and producers
            </p>
            <p className="mt-8 text-[clamp(2rem,4vw,3.25rem)] font-bold leading-[0.95] tracking-[-0.035em]">
              Send it once. Stop wondering.
            </p>
            <p className="mt-5 text-sm leading-relaxed text-mute">
              No account. Upload the original WAV or MP3, confirm your email once,
              and follow it: Delivered, Listened, Downloaded, Replied. Want your
              own link? Request an invite below.
            </p>
            <Link
              href={DEMO}
              className="mt-8 inline-block rounded-md border border-white/25 px-6 py-3.5 text-sm text-bone hover:border-white/50"
            >
              Try the sender view →
            </Link>
          </div>
        </div>
      </section>

      {/* Private by design */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div>
            <p className="text-xs uppercase tracking-[0.12em] text-lime">
              [Private by design]
            </p>
            <h2 className="mt-4 text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[0.95] tracking-[-0.04em]">
              Music stays between the people you choose.
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

      {/* Pricing */}
      <section className="mx-auto max-w-6xl border-t border-white/10 px-4 py-16 sm:px-6">
        <p className="text-xs uppercase tracking-[0.12em] text-lime">
          [Start small · grow when needed]
        </p>
        <h2 className="mt-4 text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[0.95] tracking-[-0.04em]">
          Start free. Grow when your inbox does.
        </h2>
        <p className="mt-4 text-sm text-mute">
          Free for up to 20 active tracks, for good. Pro and Team are free
          during the beta. Paid plans come after it: beta users hear first, get
          at least 30 days&apos; notice, and never lose tracks they already have.
        </p>
        <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-3">
          {Object.entries(PLANS).map(([id, p]) => (
            <div
              key={id}
              className={`flex flex-col rounded-lg border p-7 ${id === "pro" ? "border-lime/40 bg-[radial-gradient(120%_100%_at_0%_0%,rgba(213,255,72,0.08),transparent_60%)]" : "border-white/10 bg-ink-2"}`}
            >
              <p className="text-xs uppercase tracking-[0.1em] text-lime">
                {p.name}
              </p>
              <p className="mt-8 text-4xl font-bold">
                Free
                <span className="ml-2 text-xs font-normal text-dim">
                  {p.price > 0 ? "during the beta" : "for good"}
                </span>
              </p>
              <p className="mt-6 text-lg">
                {p.limit.toLocaleString("en")} active tracks
              </p>
              <p className="mt-1 flex-1 text-sm text-mute">
                {p.blurb}
              </p>
              <Link
                href={cta.href}
                className="mt-8 w-fit rounded-md bg-lime px-5 py-3 text-xs font-medium uppercase text-ink"
              >
                {user
                  ? "Open your desk"
                  : id === "free"
                    ? inviteOnly ? "Request an invite" : "Start free"
                    : inviteOnly ? "Request an invite" : "Try it in the beta"}{" "}
                →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Waitlist */}
      {!user && (
        <section id="waitlist" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid grid-cols-1 gap-10 rounded-lg border border-white/10 bg-ink-2 p-6 sm:p-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
            <div>
              <p className="text-xs uppercase tracking-[0.12em] text-lime">[Private beta]</p>
              <h2 className="mt-4 text-[clamp(2rem,4vw,3.25rem)] font-bold leading-[0.95] tracking-[-0.035em]">No invite yet?</h2>
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
        <p className="text-xs uppercase tracking-[0.12em] text-lime">
          [Questions, answered]
        </p>
        <h2 className="mt-4 text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[0.95] tracking-[-0.04em]">
          Before the first track lands.
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
              <p className="max-w-3xl pb-6 text-sm leading-relaxed text-mute">
                {a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-lime text-ink">
        <div className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
          <p className="text-xs uppercase tracking-[0.12em]">
            Your link. Your collections. Your call.
          </p>
          <h2 className="mx-auto mt-6 max-w-4xl text-[clamp(2.5rem,7vw,5.5rem)] font-bold leading-[0.92] tracking-[-0.045em]">
            Every demo in one place. Ready to play.
          </h2>
          <Link
            href={cta.href}
            className="mt-10 inline-block rounded-md bg-ink px-7 py-4 text-sm text-bone hover:bg-black"
          >
            {cta.label} →
          </Link>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-sm text-mute sm:px-6">
        <div className="flex items-center gap-4">
          <Logo />
          <span>Built for DJs and curators who receive music every week.</span>
        </div>
        <nav className="flex flex-wrap gap-x-5 gap-y-2" aria-label="Footer">
          {footerLinks().map((l) =>
            l.external ? (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="hover:text-bone"
              >
                {l.label}
              </a>
            ) : (
              <Link key={l.label} href={l.href} className="hover:text-bone">
                {l.label}
              </Link>
            ),
          )}
        </nav>
      </footer>
    </div>
  );
}
