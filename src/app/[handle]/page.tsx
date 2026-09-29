import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { activeCollection, capacity, isClosed, isPaused, pausedMessage, userByHandle } from "@/lib/core";
import { fmtDay } from "@/lib/format";
import { genresFor, RETAIN_PASSED_DAYS, RETAIN_UNREVIEWED_DAYS } from "@/lib/plans";
import { StagePage } from "./StagePage";
import { SubmitForm } from "./SubmitForm";

type Props = { params: Promise<{ handle: string }>; searchParams: Promise<{ style?: string }> };

/** Link previews for when a DJ shares their link on socials or in DMs. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const u = await userByHandle((await params).handle);
  if (!u) return { title: "FloorTest" };
  const title = `Send music to ${u.name}`;
  const description = `Upload your WAV or MP3 straight to ${u.name}${u.role_line ? ` (${u.role_line})` : ""}. No account needed, and you'll hear when it's played.`;
  const images = u.cover_key ? [{ url: `/api/cover/${u.handle}?v=${encodeURIComponent(u.cover_key)}` }] : undefined;
  return {
    title: `${title} — FloorTest`,
    description,
    alternates: { canonical: `/${u.handle}` },
    openGraph: { title, description, type: "website", url: `/${u.handle}`, images },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images: images?.map((i) => i.url) },
  };
}

export default async function ReceiverPage({ params, searchParams }: Props) {
  const { handle } = await params;
  const receiver = await userByHandle(handle);
  if (!receiver) notFound();
  const collection = await activeCollection(receiver);
  const closed = isClosed(collection);
  const { full } = await capacity(receiver);
  const genres = genresFor(collection).list;
  const paused = isPaused(receiver);
  const note = paused ? receiver.pause_message : "";
  const closedReason = paused
    ? pausedMessage(receiver)
    : closed
    ? `“${collection!.name}” closed on ${fmtDay(collection!.closes_at!, receiver.tz)}.`
    : full
      ? `${receiver.name} isn't accepting new tracks right now.`
      : null;

  // ?style= lets a receiver preview either design before switching.
  const requested = (await searchParams).style;
  const style = requested === "stage" || requested === "classic" ? requested : receiver.page_style;

  if (style === "stage") {
    return <StagePage receiver={receiver} collection={collection} accepting={!closedReason} closedReason={closedReason} note={note} />;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col px-4 py-8 sm:py-12">
      <Logo className="mb-12" />
      <p className="label">Send music to</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
        {receiver.name}
        {receiver.identity_status === "verified" && (
          <span title="Verified by FloorTest" className="chip ml-3 align-middle border-lime/60 text-sm font-medium text-lime">
            ✓ Verified
          </span>
        )}
      </h1>
      {collection && !closedReason && (
        <p className="mt-4 inline-flex w-fit flex-wrap items-center gap-x-2 gap-y-1 rounded-full border border-lime/40 bg-lime/5 px-3 py-1 text-sm">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-lime" />
          Receiving for <span className="font-medium text-lime">{collection.name}</span>
          {collection.closes_at && <span className="text-mute">· closes {fmtDay(collection.closes_at, receiver.tz)}</span>}
        </p>
      )}
      <div className="mt-10">
        {closedReason ? (
          <div className="card p-6" role="status">
            <p className="font-medium">{closedReason}</p>
            {note && <p className="mt-3 whitespace-pre-wrap border-l-2 border-lime pl-3">{note}</p>}
            <p className="mt-2 text-sm text-mute">This link stays the same. Check back soon.</p>
          </div>
        ) : (
          <SubmitForm handle={receiver.handle} receiverName={receiver.name} genres={genres} />
        )}
      </div>
      <ul className="mt-6 space-y-1 text-sm text-mute" aria-label="How your file is handled">
        <li>WAV or MP3, up to 250 MB. No account needed.</li>
        <li>Only {receiver.name} can hear or download your file.</li>
        <li>Tracks {receiver.name} doesn&apos;t decide on are deleted after {RETAIN_UNREVIEWED_DAYS} days, and ones marked could be better {RETAIN_PASSED_DAYS} days later. Kept tracks stay until they&apos;re deleted.</li>
        <li>You&apos;ll get a private receipt and an email when it&apos;s listened to, downloaded or replied to.</li>
      </ul>
      {receiver.identity_status !== "verified" && (
        <p className="mt-6 text-xs text-mute">
          Not sure this is really {receiver.name}?{" "}
          <a href={`/contact?report=${receiver.handle}`} className="underline underline-offset-4 hover:text-bone">
            Report impersonation
          </a>
        </p>
      )}
    </main>
  );
}
