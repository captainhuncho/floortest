import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { CARD, Icon } from "@/components/Kit";
import { MessagePage, PRIMARY } from "@/app/_ui/MessagePage";
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
  const legal = (
    <>
      <Link href="/terms" className="underline underline-offset-4">
        Terms
      </Link>{" "}
      ·{" "}
      <Link href="/privacy" className="underline underline-offset-4">
        Privacy
      </Link>{" "}
      · Private and not indexed. Your email is used to let you in and to show the owner what you open, play and download.
    </>
  );
  // A collection shared with an account, opened while signed out: sign in first, then come straight back.
  if (!link && !u && /^a\.\d{1,12}$/.test(token))
    return (
      <MessagePage
        icon="lock"
        title="Log in to open this collection"
        foot={legal}
        actions={
          <a href={`/c/${token}/login`} className={PRIMARY}>
            Log in
          </a>
        }
      >
        <p>It was shared with your FloorTest account.</p>
      </MessagePage>
    );
  // One answer for every link that doesn't open: unknown, expired, reset or switched off.
  if (!link)
    return (
      <MessagePage icon="link" tone="off" title="This link isn't available" foot={legal}>
        <p>It may have expired, been reset or switched off. Ask the person who sent it for a new one.</p>
      </MessagePage>
    );

  const session = await linkSession(link, await linkSessionSecret(link.id), u?.id ?? null);
  if (session) {
    const tracks = await linkTracks(link);
    return (
      // The open collection: one ~600px column on a card, like the sender's history (owner, 30 Oct).
      <main className="theme-system mx-auto flex min-h-dvh w-full max-w-[600px] flex-col gap-3 bg-ink px-3.5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))] text-bone sm:px-6 sm:pt-16">
        <Logo className="mb-2 self-center" />
        <section aria-labelledby="col-h" className={`${CARD} flex flex-col p-3`}>
          <p className="flex items-center gap-1.5 text-[11.5px] text-mute">
            <Icon name="lock" className="size-[15px]" />
            <span className="min-w-0 truncate">Private collection from {link.owner_name}</span>
          </p>
          <h1 id="col-h" className="mt-2 text-[24px] font-semibold leading-tight tracking-[-0.03em] sm:text-[28px]">
            {link.collection_name}
          </h1>
          <p className="mt-1 text-[12.5px] leading-[1.5] text-mute">
            {session.permission === "download" ? "Listen and download" : "Listen only"} · opened as {session.email}. Your access is personal: please don&apos;t forward this link.
          </p>
          {tracks.length ? (
            <ul className="mt-2.5 flex flex-col">
              {tracks.map((t) => (
                <li key={t.id} className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0">
                  <p className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                    <span className="min-w-0 truncate text-[13.5px] font-semibold">
                      {t.title}
                      {t.artist && <span className="font-normal text-mute"> · {t.artist}</span>}
                    </span>
                    <span className="text-[11.5px] text-mute tnum">{[t.genre, t.bpm ? `${Math.round(t.bpm)} BPM` : null, t.duration ? fmtTime(t.duration) : null].filter(Boolean).join(" · ")}</span>
                  </p>
                  <audio controls preload="none" controlsList="nodownload" src={`/api/c/${token}/tracks/${t.id}/audio`} className="w-full" aria-label={`Play ${t.title}`} />
                  {session.permission === "download" && (
                    <a
                      href={`/api/c/${token}/tracks/${t.id}/download`}
                      className="inline-flex min-h-11 w-fit items-center rounded-[11px] border border-line bg-well px-3.5 text-[12.5px] font-semibold text-bone hover:bg-ink-4"
                    >
                      Download original
                    </a>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-[13px] text-mute">Nothing to hear here yet. Tracks show here when {link.owner_name} adds them.</p>
          )}
        </section>
        <p className="mt-auto px-1 pt-6 text-center text-[11.5px] leading-[1.5] text-dim">{legal}</p>
      </main>
    );
  }

  // Not in yet. A signed-in account with a confirmed email skips the code.
  const account = u?.email_verified_at ? { email: u.email.toLowerCase(), userId: u.id } : null;
  const onList = account ? await recipientFor(link, account) : undefined;
  const initial = account ? (onList ? "notice" : link.requests_on && !link.requests_paused_at ? "request" : "denied") : "email";
  return (
    <MessagePage icon="lock" title={`A private collection from ${link.owner_name}`} align="start" foot={legal}>
      <Gate secret={token} ownerName={link.owner_name} notice={ACCESS_NOTICE} initial={initial} initialEmail={account?.email} />
    </MessagePage>
  );
}
