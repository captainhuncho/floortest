import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { currentPerson } from "@/lib/auth";
import { fmtTime } from "@/lib/format";
import { linkSessionSecret } from "@/lib/link-cookies";
import { ACCESS_NOTICE, linkByKey, linkSession, linkTracks, recipientFor } from "@/lib/share-links";
import { Gate } from "./Gate";

// Private by design: never indexed, never cached.
export const metadata: Metadata = { title: "Private collection — FloorTest", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * A collection share link. Before anything: the link must be live, and the visitor must be a verified person on its
 * list with the notice accepted (a session). Until then this page shows only whose collection it is.
 */
export default async function SharedLink({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const u = await currentPerson();
  const link = await linkByKey(token, u);
  const shell = (children: React.ReactNode) => (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-[18px] py-10 text-bone">
      <Logo />
      {children}
      <p className="mt-auto pt-12 text-[11px] text-faint">
        <Link href="/terms" className="underline underline-offset-4">Terms</Link> ·{" "}
        <Link href="/privacy" className="underline underline-offset-4">Privacy</Link> · Private and not indexed. Your email is used to let you in and to show the owner what you open, play and download.
      </p>
    </main>
  );
  // A collection shared with an account, opened while signed out: sign in first, then come straight back.
  if (!link && !u && /^a\.\d{1,12}$/.test(token))
    return shell(
      <>
        <h1 className="mt-10 text-[24px] font-bold">Log in to open this collection.</h1>
        <p className="mt-2 text-mute">It was shared with your FloorTest account.</p>
        <a href={`/c/${token}/login`} className="btn-lime mt-6 self-start">
          Log in
        </a>
      </>,
    );
  if (!link)
    return shell(
      <>
        <h1 className="mt-10 text-[24px] font-bold">This link isn&apos;t available.</h1>
        <p className="mt-2 text-mute">It may have expired, been reset or switched off. Ask the person who sent it for a new one.</p>
      </>,
    );

  const session = await linkSession(link, await linkSessionSecret(link.id), u?.id ?? null);
  if (session) {
    const tracks = await linkTracks(link);
    return shell(
      <>
        <p className="mt-10 text-[11px] font-bold uppercase tracking-[1px] text-faint">Private collection from {link.owner_name}</p>
        <h1 className="mt-1 text-[28px] font-bold leading-tight">{link.collection_name}</h1>
        <p className="mt-2 text-[13px] text-mute">
          {session.permission === "download" ? "Listen and download" : "Listen only"} · opened as {session.email}. Your access is personal: please don&apos;t forward this link.
        </p>
        {tracks.length ? (
          <ul className="mt-6 flex flex-col gap-3">
            {tracks.map((t) => (
              <li key={t.id} className="rounded-xl border border-line bg-ink-2 p-4">
                <p className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-bold">
                    {t.title}
                    {t.artist && <span className="font-normal text-mute"> · {t.artist}</span>}
                  </span>
                  <span className="text-[12px] text-mute tnum">{[t.genre, t.bpm ? `${Math.round(t.bpm)} BPM` : null, t.duration ? fmtTime(t.duration) : null].filter(Boolean).join(" · ")}</span>
                </p>
                <audio controls preload="none" controlsList="nodownload" src={`/api/c/${token}/tracks/${t.id}/audio`} className="mt-3 w-full" aria-label={`Play ${t.title}`} />
                {session.permission === "download" && (
                  <a href={`/api/c/${token}/tracks/${t.id}/download`} className="mt-2 inline-block text-[13px] underline underline-offset-4">
                    Download original
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-mute">Nothing to hear here yet.</p>
        )}
      </>,
    );
  }

  // Not in yet. A signed-in account with a confirmed email skips the code.
  const account = u?.email_verified_at ? { email: u.email.toLowerCase(), userId: u.id } : null;
  const onList = account ? await recipientFor(link, account) : undefined;
  const initial = account ? (onList ? "notice" : link.requests_on && !link.requests_paused_at ? "request" : "denied") : "email";
  return shell(
    <>
      <h1 className="mt-10 text-[24px] font-bold">A private collection from {link.owner_name}</h1>
      <Gate secret={token} ownerName={link.owner_name} notice={ACCESS_NOTICE} initial={initial} initialEmail={account?.email} />
    </>,
  );
}
