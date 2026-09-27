import Link from "next/link";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { APP_URL } from "@/lib/mail";
import { PLANS } from "@/lib/plans";
import { footerLinks } from "@/lib/site";
import { mono, serif } from "./fonts";
import { HomePreview } from "./HomePreview";

const HOST = APP_URL.replace(/^https?:\/\//, "");
const DEMO = "/maxwell";

const JOURNEY = [
  ["✓", "Delivered", "Original audio received safely"],
  ["♪", "Listened", "The receiver really played it"],
  ["↓", "Downloaded", "The file went to the booth"],
  ["↩", "Replied", "A message came back"],
];

const HOW = [
  [
    "Receive safely",
    "DJs, performers and labels collect private demos through one permanent link.",
  ],
  [
    "Route and organise",
    "Send each callout into the right collection without changing the public URL.",
  ],
  [
    "Listen and respond",
    "Play it, keep it or mark it could be better, download the original and reply to the sender.",
  ],
  [
    "Show what happened",
    "The sender gets a receipt for delivery, listens, downloads and replies.",
  ],
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
    "Does the public link change?",
    "Never. It stays the same while you route new tracks into whichever collection is receiving, or pause it while you're away.",
  ],
  [
    "What can a sender see?",
    "Delivered, listened (30 seconds, or a quarter of a short track), downloaded and replied. Keep and could-be-better decisions stay private to the receiver.",
  ],
  [
    "Is it free?",
    "During the beta, yes: every plan is free and sign-up is by invite code.",
  ],
];

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ deleted?: string }>;
}) {
  const user = await currentUser();
  const deleted = !!(await searchParams).deleted;
  const cta = user
    ? { href: "/dashboard/floor", label: "Open your desk" }
    : { href: "/signup", label: "Claim your receiving link" };

  return (
    <div
      className={`${serif.variable} ${mono.variable} bg-ink text-bone`}
    >
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
                <Link href="/signup" className="btn-lime btn-sm">
                  Get your link
                </Link>
              </>
            )}
          </nav>
        </header>
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-6 sm:pt-24">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-center">
            <div>
              <p className="flex items-center gap-3 font-[family-name:var(--font-stage-mono)] text-xs uppercase tracking-[0.12em] text-lime">
                <span aria-hidden className="h-px w-8 bg-lime" /> The receiving
                desk for unreleased music
              </p>
              <h1 className="mt-6 text-[clamp(3rem,7.5vw,6.5rem)] font-bold leading-[0.9] tracking-[-0.045em]">
                From private tracks
                <span className="block font-[family-name:var(--font-serif)] font-normal italic tracking-[-0.02em] text-[#a8a59c]">
                  to the DJ set.
                </span>
              </h1>
              <p className="mt-8 max-w-2xl font-[family-name:var(--font-stage-mono)] text-[15px] leading-relaxed text-[#bdb1a3]">
                FloorTest is the receiving desk for unreleased music and music
                made for the dance floor. DJs, performers and labels receive
                safely, listen, organise and respond, while senders follow every
                listen, download and reply.
              </p>
              <div className="mt-10 flex flex-wrap items-center gap-6">
                <Link
                  href={cta.href}
                  className="rounded-md bg-lime px-6 py-4 font-[family-name:var(--font-stage-mono)] text-sm font-medium uppercase text-ink hover:brightness-95"
                >
                  {cta.label} →
                </Link>
                <Link
                  href={DEMO}
                  className="font-[family-name:var(--font-stage-mono)] text-sm text-[#d8cfc4] hover:text-bone"
                >
                  view a demo submission link ↗
                </Link>
              </div>
              {!user && (
                <p className="mt-4 font-[family-name:var(--font-stage-mono)] text-xs text-[#8f8377]">
                  Private beta · sign-up by invite code
                </p>
              )}
            </div>
            {/* The one link, and where it routes: the product in a card. */}
            <div className="rounded-lg border border-white/10 bg-ink-2 p-6 sm:p-8">
              <p className="home-label">Permanent receiver link</p>
              <p className="mt-4 font-[family-name:var(--font-stage-mono)] text-xl sm:text-2xl">
              {HOST}/<wbr /><span className="text-lime">maxwell</span>
              </p>
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between rounded-md border border-white/10 px-4 py-3 text-sm text-[#a8a59c]">
                  <span>Yesterday</span>
                  <span>Afterlife collection</span>
                </div>
                <div className="flex items-center justify-between rounded-md border border-lime/50 bg-lime/[0.08] px-4 py-3 text-sm">
                  <span className="text-[#a8a59c]">Today</span>
                  <span className="font-semibold text-lime">
                    Villagers collection
                  </span>
                </div>
              </div>
              <p className="mt-5 text-sm text-[#a8a59c]">
                The public URL stays the same. You choose where it routes.
              </p>
            </div>
          </div>
          <div className="mt-20 flex flex-wrap gap-x-8 gap-y-2 border-t border-white/10 pt-6">
            {["Demos first", "Safe receiving", "Two-way signals"].map((t) => (
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
          <p className="font-[family-name:var(--font-stage-mono)] text-xs uppercase tracking-[0.12em] text-lime">
            [One private track · a visible journey]
          </p>
          <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:items-end">
            <h2 className="text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold leading-[0.95] tracking-[-0.04em]">
              Know what happened next.
            </h2>
            <p className="font-[family-name:var(--font-stage-mono)] text-sm leading-relaxed text-[#bdb1a3] lg:pb-2">
              FloorTest quietly records the meaningful moments between sending a
              track and hearing it in a room.
            </p>
          </div>
          <ol className="mt-10 grid overflow-hidden rounded-lg border border-white/10 sm:grid-cols-2 lg:grid-cols-4">
            {JOURNEY.map(([icon, title, body], i) => (
              <li
                key={title}
                className={`flex gap-4 border-white/10 p-6 ${i ? "border-t sm:border-t-0 sm:border-l" : "bg-lime/[0.06]"} ${i === 2 ? "sm:border-l-0 sm:border-t lg:border-t-0 lg:border-l" : ""} ${i === 3 ? "sm:border-t lg:border-t-0" : ""}`}
              >
                <span
                  aria-hidden
                  className={`text-xl ${i ? "text-[#8f8377]" : "text-lime"}`}
                >
                  {icon}
                </span>
                <span>
                  <span className="block font-[family-name:var(--font-stage-mono)] text-sm uppercase">
                    {title}
                  </span>
                  <span className="mt-1 block font-[family-name:var(--font-stage-mono)] text-xs text-[#8f8377]">
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
          <p className="font-[family-name:var(--font-stage-mono)] text-xs uppercase tracking-[0.12em] text-lime">
            [Live product preview]
          </p>
          <p className="home-label">Click a track</p>
        </div>
        <HomePreview host={HOST} />
      </section>

      {/* Why */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="font-[family-name:var(--font-stage-mono)] text-xs uppercase tracking-[0.12em] text-lime">
          [Why FloorTest]
        </p>
        <div className="mt-5 grid gap-6 lg:grid-cols-2 lg:items-end">
          <h2 className="text-[clamp(2.5rem,5.5vw,4.5rem)] font-bold leading-[0.95] tracking-[-0.04em]">
            Stop receiving music everywhere.
          </h2>
          <p className="font-[family-name:var(--font-stage-mono)] text-sm leading-relaxed text-[#bdb1a3] lg:pb-2">
            One private workflow replaces scattered inboxes, expired links and
            missing context.
          </p>
        </div>
        <div className="mt-10 grid md:grid-cols-2">
          <div className="border border-white/10 bg-ink-2 p-8 sm:p-10">
            <p className="home-label">The old way</p>
            <p className="mt-6 text-2xl sm:text-3xl">DMs, email and drives</p>
            <ul className="mt-8 divide-y divide-white/10 border-t border-white/10 font-[family-name:var(--font-stage-mono)] text-sm text-[#bdb1a3]">
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
            <p className="font-[family-name:var(--font-stage-mono)] text-[0.7rem] uppercase tracking-[0.1em]">
              With FloorTest
            </p>
            <p className="mt-6 text-2xl sm:text-3xl">One receiving desk</p>
            <ul className="mt-8 divide-y divide-ink/15 border-t border-ink/15 font-[family-name:var(--font-stage-mono)] text-sm">
              {[
                "Original audio, ready to download",
                "Every track routed into a collection",
                "Replies stay attached to submissions",
                "Meaningful activity reaches the sender",
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
        <p className="font-[family-name:var(--font-stage-mono)] text-xs uppercase tracking-[0.12em] text-lime">
          [How FloorTest works]
        </p>
        <h2 className="mt-4 text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[0.95] tracking-[-0.04em]">
          One link. A visible relationship.
        </h2>
        <ol className="mt-10 grid border-t border-white/10 sm:grid-cols-2 lg:grid-cols-4">
          {HOW.map(([title, body], i) => (
            <li
              key={title}
              className={`border-white/10 py-8 pr-6 ${i ? "lg:border-l lg:pl-6" : ""} ${i % 2 ? "sm:border-l sm:pl-6" : ""}`}
            >
              <p className="home-label">0{i + 1}</p>
              <p className="mt-8 text-xl">{title}</p>
              <p className="mt-3 font-[family-name:var(--font-stage-mono)] text-sm leading-relaxed text-[#bdb1a3]">
                {body}
              </p>
            </li>
          ))}
        </ol>
        <div className="mt-12 grid overflow-hidden rounded-lg border border-white/10 md:grid-cols-2">
          <div className="bg-ink-2 p-8 sm:p-12">
            <p className="font-[family-name:var(--font-stage-mono)] text-xs uppercase tracking-[0.1em] text-lime">
              For DJs, performers &amp; labels
            </p>
            <p className="mt-8 text-[clamp(2rem,4vw,3.25rem)] font-bold leading-[0.95] tracking-[-0.035em]">
              Your private receiving room.
            </p>
            <p className="mt-5 font-[family-name:var(--font-stage-mono)] text-sm leading-relaxed text-[#bdb1a3]">
              Review unreleased demos safely, organise every callout and deal
              with the people behind the music. Listen, keep, download, reply
              and prepare your set from one place.
            </p>
            <Link
              href={cta.href}
              className="mt-8 inline-block rounded-md bg-lime px-6 py-3.5 font-[family-name:var(--font-stage-mono)] text-sm font-medium uppercase text-ink"
            >
              {user ? "Open your desk" : "Claim your link"} →
            </Link>
          </div>
          <div className="border-t border-white/10 bg-ink-2 p-8 sm:p-12 md:border-l md:border-t-0">
            <p className="font-[family-name:var(--font-stage-mono)] text-xs uppercase tracking-[0.1em] text-lime">
              For artists &amp; senders
            </p>
            <p className="mt-8 text-[clamp(2rem,4vw,3.25rem)] font-bold leading-[0.95] tracking-[-0.035em]">
              Know what happened next.
            </p>
            <p className="mt-5 font-[family-name:var(--font-stage-mono)] text-sm leading-relaxed text-[#bdb1a3]">
              Send a demo without making an account. FloorTest confirms delivery
              and keeps a clear receipt as the receiver listens, downloads or
              replies.
            </p>
            <Link
              href={DEMO}
              className="mt-8 inline-block rounded-md border border-white/25 px-6 py-3.5 font-[family-name:var(--font-stage-mono)] text-sm text-bone hover:border-white/50"
            >
              try the sender view →
            </Link>
          </div>
        </div>
      </section>

      {/* Private by design */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-2">
          <div>
            <p className="font-[family-name:var(--font-stage-mono)] text-xs uppercase tracking-[0.12em] text-lime">
              [Private by design]
            </p>
            <h2 className="mt-4 text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[0.95] tracking-[-0.04em]">
              Music stays between the people you choose.
            </h2>
          </div>
          <dl className="divide-y divide-white/10 border-y border-white/10">
            {[
              [
                "Original files",
                "Receivers get the actual WAV or MP3, not a fragile streaming link.",
              ],
              [
                "Controlled access",
                "Your link routes to the collection you choose. Pause it, set closing dates, or block a sender.",
              ],
              [
                "Clear retention",
                "Free accounts hold 20 active tracks. Unreviewed tracks auto-delete after 90 days; kept ones stay until you remove them.",
              ],
            ].map(([k, v]) => (
              <div key={k} className="py-5">
                <dt className="font-[family-name:var(--font-stage-mono)] text-xs uppercase tracking-[0.1em] text-lime">
                  {k}
                </dt>
                <dd className="mt-2 font-[family-name:var(--font-stage-mono)] text-sm text-[#bdb1a3]">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Pricing */}
      <section className="mx-auto max-w-6xl border-t border-white/10 px-4 py-16 sm:px-6">
        <p className="font-[family-name:var(--font-stage-mono)] text-xs uppercase tracking-[0.12em] text-lime">
          [Start small · grow when needed]
        </p>
        <h2 className="mt-4 text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[0.95] tracking-[-0.04em]">
          Receiving should be easy.
        </h2>
        <p className="mt-4 font-[family-name:var(--font-stage-mono)] text-sm text-[#bdb1a3]">
          Free during the beta. Paid plans start after it ends, and you&apos;ll
          hear first.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {Object.entries(PLANS).map(([id, p]) => (
            <div
              key={id}
              className={`flex flex-col rounded-lg border p-7 ${id === "pro" ? "border-lime/40 bg-[radial-gradient(120%_100%_at_0%_0%,rgba(213,255,72,0.08),transparent_60%)]" : "border-white/10 bg-ink-2"}`}
            >
              <p className="font-[family-name:var(--font-stage-mono)] text-xs uppercase tracking-[0.1em] text-lime">
                {p.name}
              </p>
              <p className="mt-8 text-4xl font-bold">
                ${p.price}
                {p.price > 0 && (
                  <span className="ml-1 font-[family-name:var(--font-stage-mono)] text-xs font-normal text-[#8f8377]">
                    / month after beta
                  </span>
                )}
              </p>
              <p className="mt-6 text-lg">
                {p.limit.toLocaleString("en")} active songs
              </p>
              <p className="mt-1 flex-1 font-[family-name:var(--font-stage-mono)] text-sm text-[#bdb1a3]">
                {p.blurb}
              </p>
              <Link
                href={cta.href}
                className="mt-8 w-fit rounded-md bg-lime px-5 py-3 font-[family-name:var(--font-stage-mono)] text-xs font-medium uppercase text-ink"
              >
                {user
                  ? "Open your desk"
                  : id === "free"
                    ? "Start free"
                    : "Start in beta"}{" "}
                →
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="font-[family-name:var(--font-stage-mono)] text-xs uppercase tracking-[0.12em] text-lime">
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
              <p className="max-w-3xl pb-6 font-[family-name:var(--font-stage-mono)] text-sm leading-relaxed text-[#bdb1a3]">
                {a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-lime text-ink">
        <div className="mx-auto max-w-6xl px-4 py-24 text-center sm:px-6">
          <p className="font-[family-name:var(--font-stage-mono)] text-xs uppercase tracking-[0.12em]">
            Your link. Your collections. Your music network.
          </p>
          <h2 className="mx-auto mt-6 max-w-4xl text-[clamp(2.5rem,7vw,5.5rem)] font-bold leading-[0.92] tracking-[-0.045em]">
            Make every private track easier to receive.
          </h2>
          <Link
            href={cta.href}
            className="mt-10 inline-block rounded-md bg-ink px-7 py-4 font-[family-name:var(--font-stage-mono)] text-sm text-bone hover:bg-black"
          >
            {user ? "open your desk" : "claim your permanent link"} →
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
