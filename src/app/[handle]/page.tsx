import { CuePoint } from "@/components/CuePoint";
import { ProfileLinks } from "@/components/ProfileLinks";
import { readLinks } from "@/lib/socials";
import { fill, siteCopy } from "@/lib/content";
import { listeners } from "@/lib/team";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { forwardedHandle } from "@/lib/accounts";
import { activeCollection, capacity, isClosed, isPaused, pausedMessage, userByHandle } from "@/lib/desk";
import { fmtDay } from "@/lib/format";
import { genresFor, RETAIN_UNREVIEWED_DAYS } from "@/lib/plans";
import { shareDownloadEnabled } from "@/lib/plan-store";
import { switchOn } from "@/lib/switches";
import { botCheckKey } from "@/lib/turnstile";
import { SubmitForm } from "./SubmitForm";

type Props = { params: Promise<{ handle: string }>; };

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
    // Shared by the receiver, not for search engines: link previews still work, search listings don't.
    robots: { index: false, follow: false },
    openGraph: { title, description, type: "website", url: `/${u.handle}`, images },
    twitter: { card: images ? "summary_large_image" : "summary", title, description, images: images?.map((i) => i.url) },
  };
}

export default async function ReceiverPage({ params }: Props) {
  const { handle } = await params;
  const receiver = await userByHandle(handle);
  if (!receiver) {
    const moved = await forwardedHandle(handle);
    if (moved) permanentRedirect(`/${moved}`);
    notFound();
  }
  const collection = await activeCollection(receiver);
  const sharing = await switchOn("sharing");
  const team = await listeners(collection);
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

  const range = collection?.bpm_min && collection?.bpm_max ? `${collection.bpm_min}–${collection.bpm_max} BPM` : null;
  const wantedText = collection?.brief_wanted || "";
  // Always tell senders what's wanted: the collection's own genres, or the default list when none are set.
  const showBrief = !closedReason && genres.length > 0;
  const c = await siteCopy("link");
  const vars = { receiver: receiver.name, days: RETAIN_UNREVIEWED_DAYS };
  const bullets = [c.bullet_files, team.length ? c.bullet_private_team : c.bullet_private, c.bullet_retention, c.bullet_receipt].map((b) => fill(b, vars)).filter(Boolean);

  return (
    <main className="group/page mx-auto flex min-h-dvh max-w-xl flex-col gap-6 bg-ink px-[18px] py-8 text-bone sm:py-12">
      <div className="flex flex-col gap-3">
        {receiver.cover_key && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/cover/${receiver.handle}?v=${encodeURIComponent(receiver.cover_key)}`}
            alt=""
            width={112}
            height={112}
            className="mb-1 size-28 rounded-2xl object-cover group-has-[[data-picked]]/page:hidden"
          />
        )}
        <p className="text-[11px] font-bold uppercase tracking-[1px] text-mute">{c.kicker}</p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="break-words text-[clamp(2rem,12vw,3.5rem)] font-bold leading-none group-has-[[data-picked]]/page:text-[32px] group-has-[[data-picked]]/page:font-extrabold">
            {receiver.name}
            {receiver.identity_status === "verified" && (
              <CuePoint size={24} label="Verified by FloorTest: this account controls the linked profile" className="-mt-1 ml-2" />
            )}
          </h1>
          {collection && !closedReason && (
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-2 px-2.5 py-1.5 text-[11px] font-bold">
              <span aria-hidden className="size-1.5 rounded-full bg-lime" />
              Receiving for <span className="text-lime">{collection.name}</span>
            </p>
          )}
        </div>
        <ProfileLinks links={readLinks(receiver.links)} className="group-has-[[data-picked]]/page:hidden" />
        {team.length > 0 && !closedReason && (
          <p className="text-[12px] text-mute">
            Tracks sent here are also heard by {receiver.name}&apos;s team: <span className="text-bone">{team.map((m) => m.name).join(", ")}</span>.
          </p>
        )}
        {showBrief && (
          <section aria-label="What they're looking for" className="group-has-[[data-picked]]/page:hidden flex flex-col gap-2 rounded-xl border border-line bg-ink-2 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.5px] text-mute">{c.looking_for}</p>
            {(
              <ul className="flex flex-wrap gap-1.5">
                {genres.map((g) => (
                  <li key={g} className="rounded-full border border-line bg-ink px-2 py-1 text-[11px] font-bold">
                    {g}
                  </li>
                ))}
              </ul>
            )}
            {wantedText && <p className="text-[11px] font-bold">{wantedText}</p>}
            {range && <p className="text-[11px] font-bold">{range}</p>}
            {collection?.closes_at && <p className="text-[11px] font-bold">Open until {fmtDay(collection.closes_at, receiver.tz)}</p>}
            {collection?.brief_note && <p className="text-[11px] italic leading-4 text-mute">&ldquo;{collection.brief_note}&rdquo;</p>}
            {sharing && !!collection?.allow_sharing && (
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-dim">
                <span aria-hidden className="text-lime">✓</span> Sharing with colleagues allowed
              </p>
            )}
          </section>
        )}
      </div>
      <div>
        {closedReason ? (
          <div className="rounded-2xl border border-line bg-ink-2 p-5" role="status">
            <p className="font-bold">{closedReason}</p>
            {note && <p className="mt-3 whitespace-pre-wrap border-l-2 border-lime pl-3 text-[13px]">{note}</p>}
            <p className="mt-2 text-[12px] text-dim">{c.closed_note}</p>
          </div>
        ) : (
          <SubmitForm botCheckKey={await botCheckKey()} handle={receiver.handle} receiverName={receiver.name} genres={genres} look="mobile" allowSharing={sharing && !!collection?.allow_sharing} sharingDownloads={await shareDownloadEnabled(receiver.plan)} />
        )}
      </div>
      <ul className="flex flex-col gap-2.5" aria-label="How your file is handled">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2.5 text-[11px] font-medium leading-4 text-dim">
            <span aria-hidden>→</span>
            {b}
          </li>
        ))}
      </ul>
      {receiver.identity_status !== "verified" && (
        <p className="mt-auto pt-4 text-center text-[12px] font-medium leading-[18px] text-dim">
          Not sure this is really {receiver.name}?{" "}
          <a href={`/contact?report=${receiver.handle}`} className="underline hover:text-bone">
            Report impersonation
          </a>
        </p>
      )}
    </main>
  );
}
