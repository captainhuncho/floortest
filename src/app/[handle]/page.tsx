import { ProfileBar } from "./ProfileBar";
import { briefItems } from "@/lib/brief";
import { Logo } from "@/components/Logo";
import { siteEditor } from "@/lib/site-editor";
import { EditablePage, editable } from "@/components/Editable";
import { CuePoint } from "@/components/CuePoint";
import { ProfileLinks } from "@/components/ProfileLinks";
import { readLinks } from "@/lib/socials";
import { fill, siteCopy } from "@/lib/content";
import { teamSize } from "@/lib/team";
import type { Metadata, Viewport } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { forwardedHandle } from "@/lib/accounts";
import { activeCollection, capacity, isClosed, isPaused, pausedMessage, userByHandleForView } from "@/lib/desk";
import { fmtDay } from "@/lib/format";
import { genresFor, RETAIN_UNREVIEWED_DAYS } from "@/lib/plans";
import { folderLimit, trackArtEnabled } from "@/lib/plan-store";
import { switchOn } from "@/lib/switches";
import { botCheckKey } from "@/lib/turnstile";
import { ReopenAlert } from "./ReopenAlert";
import { CARD, Cover, Icon, initials } from "@/components/Kit";
import { SendModes } from "./SendModes";

type Props = { params: Promise<{ handle: string }>; };

/** Link previews for when a DJ shares their link on socials or in DMs. */
// The browser bar matches the page in either mode.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafaf6" },
    { media: "(prefers-color-scheme: dark)", color: "#10110f" },
  ],
};

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

  const verified = receiver.identity_status === "verified";
  const cover = receiver.cover_key ? `/api/cover/${receiver.handle}?v=${encodeURIComponent(receiver.cover_key)}` : null;
  // The promise lines, each with its own small icon (who hears it, deletion, receipt).
  const bulletIcon = { bullet_private: "lock", bullet_private_team: "lock", bullet_retention: "clock", bullet_receipt: "mail" } as const;

  return (
    <EditablePage editing={!!editor} page="link" label="Public link" values={c}>
    {/* Light or dark with the visitor's device (theme-system, the dashboard's "System" setting; owner, 29 Oct). */}
    {/* One column at every width (owner, 29 Oct), in the desk's card look (owner, 30 Oct): the receiver's card at the top,
        kept (smaller) once a file is picked; the brief, the drop box or the form below. */}
    <main className="theme-system group/page mx-auto flex min-h-dvh max-w-[600px] flex-col gap-3 bg-ink px-3.5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] text-bone sm:px-6 sm:pt-10">
      <ProfileBar cover={cover} name={receiver.name} callout={collection && !closedReason ? collection.name : null}>
      <header className={`${CARD} flex flex-col gap-2.5 p-3`}>
        <div className="flex items-center gap-3">
          {cover ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" width={64} height={64} className="size-16 shrink-0 rounded-2xl object-cover group-has-[[data-picked]]/page:size-11 group-has-[[data-picked]]/page:rounded-xl" />
          ) : (
            <Cover text={initials(receiver.name)} size="size-16 text-[19px]! rounded-2xl! group-has-[[data-picked]]/page:size-11 group-has-[[data-picked]]/page:text-[14px]! group-has-[[data-picked]]/page:rounded-xl!" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] text-mute"><E k="kicker" /></p>
            <h1 className="mt-0.5 break-words text-[19px] font-semibold leading-tight tracking-[-0.025em] group-has-[[data-picked]]/page:text-[17px]">
              {receiver.name}
              {verified && <CuePoint size={20} label="Verified by FloorTest: this account controls the linked profile" className="-mt-0.5 ml-1.5" />}
            </h1>
          </div>
        </div>
        {collection && !closedReason && (
          <p className="flex min-w-0 items-center gap-2 rounded-xl bg-lime/12 px-3 py-2 text-[12.5px]">
            {collection.art_key ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/collection-art/${collection.id}?v=${encodeURIComponent(collection.art_key)}`} alt="" className="-my-0.5 size-5 shrink-0 rounded object-cover" />
            ) : (
              <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-(--color-lime)" />
            )}
            <span className="text-mute"><E k="receiving_for" /></span>
            <span className="min-w-0 truncate font-semibold">{collection.name}</span>
          </p>
        )}
        <ProfileLinks links={readLinks(receiver.links)} size={20} className="group-has-[[data-picked]]/page:hidden" />
      </header>
      </ProfileBar>
      {closedReason ? (
        <div className={`${CARD} flex flex-col gap-2 p-3`} role="status">
          <p className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.015em]">
            <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-line bg-well text-[#d98a2b]">
              <Icon name="clock" className="size-4" />
            </span>
            {closedReason}
          </p>
          {note && <p className="whitespace-pre-wrap border-l-2 border-lime pl-3 text-[13px]">{note}</p>}
          <p className="text-[12px] text-dim"><E k="closed_note" /></p>
          <ReopenAlert handle={receiver.handle} receiverName={receiver.name} botCheckKey={botKey} />
        </div>
      ) : (
        <SendModes folderBytes={folderBytes} brief={brief} receiverFirstName={firstName} bpmRange={bpmRange} promise={bullets.map(([, b]) => b)} botCheckKey={botKey} handle={receiver.handle} receiverName={receiver.name} callout={collection && !closedReason ? collection.name : null} genres={genres} allowSharing={sharing && !!collection?.allow_sharing} trackArt={trackArt} />
      )}
      {/* Once a file is picked the form repeats these above Send, so they step aside here. */}
      {!closedReason && (
      <ul className="flex flex-col gap-2 px-1 pt-1 group-has-[[data-picked]]/page:hidden" aria-label="How your file is handled">
        {bullets.map(([k, b]) => (
          <li key={k} {...panel(k, "Keep {receiver} and {days} as they are: the page fills them in.")} className="flex gap-2.5 text-[12.5px] leading-5 text-mute">
            <Icon name={bulletIcon[k]} className="mt-0.5 size-[15px] text-bone" />
            {b}
          </li>
        ))}
      </ul>
      )}
      <footer className="mt-auto flex flex-col items-center gap-3 pt-6">
        {!verified && (
          <p className="text-center text-[12px] font-medium leading-[18px] text-dim">
            <span {...panel("impersonation_prompt", "Keep {receiver} as it is: the page fills in the receiver's name.")}>{fill(c.impersonation_prompt, vars)}</span>{" "}
            <a href={`/contact?report=${receiver.handle}`} className="py-3 underline hover:text-bone">
              <E k="impersonation_link" />
            </a>
          </p>
        )}
        <Logo small />
      </footer>
    </main>
    </EditablePage>
  );
}
