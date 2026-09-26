import Link from "next/link";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { PLANS } from "@/lib/plans";

const steps = [
  ["Share one", "permanent link"],
  ["Senders upload", "the original file"],
  ["Press play", "in Submissions"],
  ["Keep, could be better", "or reply"],
  ["Prepare kept", "tracks for your set"],
];

const features = [
  ["One place to review", "Submissions is the whole job: play, then keep it or mark it could be better, and the next track comes up. Undo is always one key away."],
  ["Signals that mean something", "Senders hear when a track was really listened to (30 seconds or a quarter of it), downloaded, or replied to. Your keep and could-be-better calls stay private."],
  ["Originals, ready for the booth", "Kept tracks download together as WAV/MP3 originals with a Rekordbox XML and M3U8 playlist."],
  ["Intake you control", "Closing dates per callout, upload limits, verified sender emails, blocking, and automatic deletion of what you don't keep."],
];

export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const user = await currentUser();
  const deleted = !!(await searchParams).deleted;
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {deleted && (
        <p role="status" className="mt-6 rounded-lg border border-line bg-ink-2 px-4 py-3 text-sm">
          Your account and everything in it have been deleted. Thanks for trying FloorTest.
        </p>
      )}
      <header className="flex items-center justify-between py-6">
        <Logo />
        <nav className="flex items-center gap-2">
          {user ? (
            <Link href="/dashboard/floor" className="btn-lime btn-sm">Open desk</Link>
          ) : (
            <>
              <Link href="/login" className="btn-ghost btn-sm">Log in</Link>
              <Link href="/signup" className="btn-lime btn-sm">Get your link</Link>
            </>
          )}
        </nav>
      </header>

      <section className="grid gap-12 py-16 md:grid-cols-[1.2fr_1fr] md:py-24">
        <div>
          <p className="label mb-6">The receiving desk for unreleased music</p>
          <h1 className="text-5xl font-bold leading-[0.95] tracking-tight sm:text-7xl">
            From private track <span className="text-lime">to the DJ set.</span>
          </h1>
          <p className="mt-8 max-w-lg text-lg text-mute">
            Share one link. Hear incoming music fast, make a quick decision, and let senders know what happened. No music
            admin, no sender accounts.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <Link href="/signup" className="btn-lime">Claim your receiver link</Link>
            <Link href="#how" className="btn-ghost">How it works</Link>
          </div>
        </div>
        <div className="card self-center p-6">
          <p className="label">Permanent receiver link</p>
          <p className="mt-3 font-mono text-2xl">floortest.app/<span className="text-lime">maxwell</span></p>
          <div className="mt-6 space-y-2 text-sm">
            <div className="flex items-center justify-between rounded-md border border-line px-3 py-2.5 text-mute">
              <span>Yesterday</span><span>Afterlife collection</span>
            </div>
            <div className="flex items-center justify-between rounded-md border border-lime/50 bg-lime/5 px-3 py-2.5">
              <span className="text-mute">Today</span><span className="font-medium text-lime">Villagers collection</span>
            </div>
          </div>
          <p className="mt-4 text-xs text-mute">The public URL stays the same. You choose where it routes.</p>
        </div>
      </section>

      <section id="how" className="border-t border-line py-16">
        <p className="label mb-8">The whole loop</p>
        <ol className="grid gap-3 sm:grid-cols-5">
          {steps.map(([a, b], i) => (
            <li key={i} className="card p-4">
              <span className="font-mono text-xs text-lime">0{i + 1}</span>
              <p className="mt-6 text-sm leading-snug">{a}<br /><span className="text-mute">{b}</span></p>
            </li>
          ))}
        </ol>
        <p className="mt-6 text-sm text-mute">No sender account · Original files, not expiring streams · Every decision can be undone</p>
      </section>

      <section className="grid gap-3 border-t border-line py-16 sm:grid-cols-2">
        {features.map(([t, d]) => (
          <div key={t} className="card p-6">
            <p className="label text-lime">{t}</p>
            <p className="mt-3 text-bone">{d}</p>
          </div>
        ))}
      </section>

      <section className="border-t border-line py-16">
        <p className="label mb-8">Free access builds the receiving habit</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(PLANS).map(([id, p]) => (
            <div key={id} className={`card p-6 ${id === "pro" ? "border-lime/50" : ""}`}>
              <p className="label">{p.name}</p>
              <p className="mt-4 text-4xl font-bold tnum">${p.price}<span className="text-base font-normal text-mute">{p.price ? " / month" : ""}</span></p>
              <p className="mt-4 text-sm">{p.limit.toLocaleString()} active songs</p>
              <p className="text-sm text-mute">{p.blurb}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="flex items-center justify-between border-t border-line py-8 text-sm text-mute">
        <Logo className="text-sm" />
        <span>Built for DJs and curators who receive music every week.</span>
      </footer>
    </div>
  );
}
