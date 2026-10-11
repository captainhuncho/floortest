import { briefItems } from "@/lib/brief";
import { Logo } from "@/components/Logo";
import { siteEditor } from "@/lib/site-editor";
import { EditablePage, editable } from "@/components/Editable";
import { CuePoint } from "@/components/CuePoint";
import { ProfileLinks } from "@/components/ProfileLinks";
import { readLinks } from "@/lib/socials";
import { fill, siteCopy } from "@/lib/content";
import { teamSize } from "@/lib/team";
import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { forwardedHandle } from "@/lib/accounts";
import { activeCollection, capacity, isClosed, isPaused, pausedMessage, userByHandleForView } from "@/lib/desk";
import { fmtDay } from "@/lib/format";
import { genresFor, RETAIN_UNREVIEWED_DAYS } from "@/lib/plans";
import { folderLimit, trackArtEnabled } from "@/lib/plan-store";
import { switchOn } from "@/lib/switches";
import { botCheckKey } from "@/lib/turnstile";
import { ReopenAlert } from "./ReopenAlert";
import { SendModes } from "./SendModes";

type Props = { params: Promise<{ handle: string }>; };

/** Link previews for when a DJ shares their link on socials or in DMs. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const u = await userByHandleForView((await params).handle);
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
  const receiver = await userByHandleForView(handle);
  if (!receiver) {
    const moved = await forwardedHandle(handle);
    if (moved) permanentRedirect(`/${moved}`);
    notFound();
  }
  const [collection, sharing, { full }, c, editor] = await Promise.all([activeCollection(receiver), switchOn("sharing"), capacity(receiver), siteCopy("link"), siteEditor()]);
  const { E, panel } = editable(c, !!editor);
  const closed = isClosed(collection);
  const { list: genres, custom: ownGenres } = genresFor(collection);
  const paused = isPaused(receiver);
  const note = paused ? receiver.pause_message : "";
  const [team, folderBytes, botKey, trackArt] = await Promise.all([teamSize(receiver.id), folderLimit(receiver.plan), botCheckKey(), trackArtEnabled(receiver.plan)]);
  const closedReason = paused
    ? pausedMessage(receiver)
    : closed
    ? collection!.full_at
      ? `“${collection!.name}” is full: it has all the tracks ${receiver.name} asked for.`
      : `“${collection!.name}” closed on ${fmtDay(collection!.closes_at!, receiver.tz)}.`
    : full
      ? `${receiver.name} isn't accepting new tracks right now.`
      : null;

  // The brief shows only what the receiver asked for: their own genres (never the default list, which they didn't choose),
  // and the rest as it reads on the desk. Genres become tappable choices that carry into the form.
  const briefRest = collection ? briefItems(collection, [], receiver.tz).filter((b) => b.key !== "genres") : [];
  const firstName = receiver.first_name || receiver.name.split(" ")[0];
  const shareNote = sharing && !!collection?.allow_sharing ? `${firstName} may share what you send privately with people they name.` : null;
  const brief = closedReason ? null : { heading: <E k="looking_for" />, genres: ownGenres ? genres : [], items: briefRest, shareNote };
  const bpmRange: [number, number] | null = collection?.bpm_min && collection.bpm_max ? [collection.bpm_min, collection.bpm_max] : null;
  const vars = { receiver: receiver.name, days: RETAIN_UNREVIEWED_DAYS };
  // What happens to the file: shown under the drop zone, and again above Send once a file is picked (the form gets the text).
  const bullets = ([team ? "bullet_private_team" : "bullet_private", "bullet_retention", "bullet_receipt"] as const).map((k) => [k, fill(c[k], vars)] as const).filter(([, b]) => b);

  return (
    <EditablePage editing={!!editor} page="link" label="Public link" values={c}>
    <main className="group/page mx-auto flex min-h-dvh max-w-xl flex-col gap-6 bg-ink px-[18px] py-8 text-bone sm:py-12 lg:grid lg:max-w-5xl lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:content-start lg:gap-x-16 lg:gap-y-8 lg:px-8 lg:py-16">
      <div className="flex flex-col gap-3 lg:col-start-1 lg:row-start-1">
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
        <p className="text-[11px] font-bold uppercase tracking-[1px] text-mute"><E k="kicker" /></p>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="break-words text-[clamp(2rem,12vw,3.5rem)] font-bold leading-none group-has-[[data-picked]]/page:text-[28px] group-has-[[data-picked]]/page:tracking-[-0.5px]">
            {receiver.name}
            {receiver.identity_status === "verified" && (
              <CuePoint size={24} label="Verified by FloorTest: this account controls the linked profile" className="-mt-1 ml-2" />
            )}
          </h1>
          {collection && !closedReason && (
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-ink-2 px-2.5 py-1.5 text-[11px] font-bold">
              {collection.art_key ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/collection-art/${collection.id}?v=${encodeURIComponent(collection.art_key)}`} alt="" className="-my-0.5 size-5 rounded object-cover" />
              ) : (
                <span aria-hidden className="size-1.5 rounded-full bg-lime" />
              )}
              Receiving for <span className="text-bone">{collection.name}</span>
            </p>
          )}
        </div>
        <ProfileLinks links={readLinks(receiver.links)} className="group-has-[[data-picked]]/page:hidden" />
      </div>
      <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
        {closedReason ? (
          <div className="rounded-2xl border border-line bg-ink-2 p-5" role="status">
            <p className="font-bold">{closedReason}</p>
            {note && <p className="mt-3 whitespace-pre-wrap border-l-2 border-lime pl-3 text-[13px]">{note}</p>}
            <p className="mt-2 text-[12px] text-dim"><E k="closed_note" /></p>
            <ReopenAlert handle={receiver.handle} receiverName={receiver.name} botCheckKey={botKey} />
          </div>
        ) : (
          <SendModes folderBytes={folderBytes} brief={brief} bpmRange={bpmRange} promise={bullets.map(([, b]) => b)} botCheckKey={botKey} handle={receiver.handle} receiverName={receiver.name} callout={collection && !closedReason ? collection.name : null} genres={genres} allowSharing={sharing && !!collection?.allow_sharing} trackArt={trackArt} />
        )}
      </div>
      {!closedReason && (
      <ul className="-mt-2 flex flex-col gap-2 group-has-[[data-picked]]/page:hidden lg:col-start-1 lg:row-start-2 lg:mt-0 lg:self-start" aria-label="How your file is handled">
        {bullets.map(([k, b]) => (
          <li key={k} {...panel(k, "Keep {receiver} and {days} as they are: the page fills them in.")} className="flex gap-2.5 text-[13px] leading-5 text-mute">
            <span aria-hidden>→</span>
            {b}
          </li>
        ))}
      </ul>
      )}
      <footer className="mt-auto flex flex-col items-center gap-3 pt-4 lg:col-span-2 lg:mt-8">
        {receiver.identity_status !== "verified" && (
          <p className="text-center text-[12px] font-medium leading-[18px] text-dim">
            Not sure this is really {receiver.name}?{" "}
            <a href={`/contact?report=${receiver.handle}`} className="py-3 underline hover:text-bone">
              Report impersonation
            </a>
          </p>
        )}
        <Logo small />
      </footer>
    </main>
    </EditablePage>
  );
}
