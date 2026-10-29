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

  return (
    <EditablePage editing={!!editor} page="link" label="Public link" values={c}>
    {/* Light or dark with the visitor's device (theme-system, the dashboard's "System" setting; owner, 29 Oct). */}
    {/* One column at every width (owner, 29 Oct): the receiver's photo, name and callout centred at the top and kept
        there once a file is picked; the brief, the drop box or the form below, left-aligned. */}
    <main className="theme-system group/page mx-auto flex min-h-dvh max-w-[600px] flex-col gap-7 bg-ink px-[18px] py-10 text-bone sm:py-14">
      <ProfileBar cover={receiver.cover_key ? `/api/cover/${receiver.handle}?v=${encodeURIComponent(receiver.cover_key)}` : null} name={receiver.name} callout={collection && !closedReason ? collection.name : null}>
      <header className="flex flex-col items-center gap-2.5 text-center">
        {receiver.cover_key && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`/api/cover/${receiver.handle}?v=${encodeURIComponent(receiver.cover_key)}`}
            alt=""
            width={96}
            height={96}
            className="mb-1 size-24 rounded-[18px] object-cover"
          />
        )}
        <p className="font-mono text-sm text-mute"><E k="kicker" /></p>
        <h1 className="break-words text-[30px] font-semibold leading-tight tracking-[-0.4px]">
          {receiver.name}
          {receiver.identity_status === "verified" && (
            <CuePoint size={20} label="Verified by FloorTest: this account controls the linked profile" className="-mt-1 ml-2" />
          )}
        </h1>
        {collection && !closedReason && (
          <p className="mt-1 inline-flex items-center gap-2 rounded-full border border-line bg-ink-2 px-3.5 py-1.5 text-[13px] font-semibold">
            {collection.art_key ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/collection-art/${collection.id}?v=${encodeURIComponent(collection.art_key)}`} alt="" className="-my-0.5 size-5 rounded object-cover" />
            ) : (
              <span aria-hidden className="size-1.5 rounded-full bg-(--color-lime)" />
            )}
            <span className="font-medium text-mute"><E k="receiving_for" /></span> {collection.name}
          </p>
        )}
        <ProfileLinks links={readLinks(receiver.links)} size={20} className="mt-1 justify-center" />
      </header>
      </ProfileBar>
      <hr className="border-line" />
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
      {/* Once a file is picked the form repeats these above Send, so they step aside here. */}
      {!closedReason && (
      <ul className="-mt-1 flex flex-col gap-2 group-has-[[data-picked]]/page:hidden" aria-label="How your file is handled">
        {bullets.map(([k, b]) => (
          <li key={k} {...panel(k, "Keep {receiver} and {days} as they are: the page fills them in.")} className="flex gap-2.5 text-[13px] leading-5 text-mute">
            <span aria-hidden>→</span>
            {b}
          </li>
        ))}
      </ul>
      )}
      <footer className="mt-auto flex flex-col items-center gap-3 pt-4">
        {receiver.identity_status !== "verified" && (
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
