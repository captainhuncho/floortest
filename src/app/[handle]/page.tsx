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
import { activeCollection, calloutBlock, capacity, isPaused, NOT_OPEN_YET, pausedMessage, userByHandleForView } from "@/lib/desk";
import { fmtDay } from "@/lib/format";
import { genresFor } from "@/lib/plans";
import { folderLimit, trackArtEnabled } from "@/lib/plan-store";
import { switchOn } from "@/lib/switches";
import { botCheckKey } from "@/lib/turnstile";
import { ReopenAlert } from "./ReopenAlert";
import { Icon } from "@/components/Kit";
import { SendModes } from "./SendModes";
import { receiverAsksPlayChoice } from "@/lib/account-types";
import { currentTermsOrNull } from "@/lib/terms-record";

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
  const { list: genres, custom: ownGenres } = genresFor(collection);
  const paused = isPaused(receiver);
  const note = paused ? receiver.pause_message : "";
  const [team, folderBytes, botKey, trackArt] = await Promise.all([teamSize(receiver.id), folderLimit(receiver.plan), botCheckKey(), trackArtEnabled(receiver.plan)]);
  const block = calloutBlock(receiver, collection, full);
  const closedReason =
    block === "not_open"
      ? NOT_OPEN_YET(receiver.name)
      : block === "paused"
      ? pausedMessage(receiver)
      : block === "full"
        ? `“${collection!.name}” is full: it has all the tracks ${receiver.name} asked for.`
        : block === "closed"
          ? `“${collection!.name}” closed on ${fmtDay(collection!.closes_at!, receiver.tz)}.`
          : block
            ? `${receiver.name} isn't accepting new tracks right now.`
            : null;

  // The brief shows only what the receiver asked for: their own genres (never the default list, which they didn't choose),
  // and the rest as it reads on the desk. Genres become tappable choices that carry into the form.
  // The closing date sits in the callout line under the name, so the brief doesn't repeat it.
  const briefRest = collection ? briefItems(collection, [], receiver.tz).filter((b) => b.key !== "genres" && b.key !== "deadline") : [];
  const firstName = receiver.first_name || receiver.name.split(" ")[0];
  const shareNote = sharing && !!collection?.allow_sharing ? `${firstName} may share what you send privately with people they name.` : null;
  const brief = closedReason ? null : { heading: <E k="looking_for" />, genres: ownGenres ? genres : [], items: briefRest, shareNote };
  const bpmRange: [number, number] | null = collection?.bpm_min && collection.bpm_max ? [collection.bpm_min, collection.bpm_max] : null;
  const vars = { receiver: receiver.name };
  // What happens to the file, under the drop box: who hears it, the receipt, no account. Once a file is picked the form
  // says it in one line above Send.
  const bullets = ([team ? "bullet_private_team" : "bullet_private", "bullet_receipt", "bullet_no_account"] as const).map((k) => [k, fill(c[k], vars)] as const).filter(([, b]) => b);

  const verified = receiver.identity_status === "verified";
  const cover = receiver.cover_key ? `/api/cover/${receiver.handle}?v=${encodeURIComponent(receiver.cover_key)}` : null;
  const bulletIcon = { bullet_private: "lock", bullet_private_team: "lock", bullet_receipt: "mail", bullet_no_account: "check" } as const;
  const open = collection && !closedReason ? collection : null;

  return (
    <EditablePage editing={!!editor} page="link" label="Public link" values={c}>
    {/* Light or dark with the visitor's device (theme-system, the dashboard's "System" setting; owner, 29 Oct). */}
    {/* One column at every width, about 560px (owner, 29 Oct; option 48, 17 Nov), one step at a time on the page
        background: the receiver, what they want, the drop box and what happens to the file; then the form in their place. */}
    <main className="theme-system group/page mx-auto flex min-h-dvh max-w-[560px] flex-col gap-3.5 bg-ink px-3.5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] text-bone sm:px-5 sm:pt-8">
      {/* Only a live receiver's page carries this, so the visit counter credits a handle only here (src/lib/visit-beacon.ts). */}
      <span hidden data-visit-handle={receiver.handle} />
      <ProfileBar cover={cover} name={receiver.name} callout={open ? open.name : null}>
      <header className="flex flex-col items-center gap-1 pt-2 text-center">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" width={72} height={72} className="mb-2 size-[72px] rounded-full object-cover" />
        )}
        <p className="text-[12px] text-mute"><E k="kicker" /></p>
        <h1 className="break-words text-[24px] font-semibold leading-tight tracking-[-0.02em]">
          {receiver.name}
          {verified && <CuePoint size={20} label="Verified by FloorTest: this account controls the linked profile" className="-mt-1 ml-2" />}
        </h1>
        {open ? (
          <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-[13px] text-mute">
            {open.art_key && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={`/api/collection-art/${open.id}?v=${encodeURIComponent(open.art_key)}`} alt="" width={20} height={20} className="size-5 rounded object-cover" />
            )}
            <span><E k="receiving_for" /></span> <span className="font-semibold text-bone">{open.name}</span>
            {open.closes_at && <span>· closes {fmtDay(open.closes_at, receiver.tz)}</span>}
          </p>
        ) : (
          !closedReason && receiver.role_line && <p className="text-[13px] text-mute">{receiver.role_line}</p>
        )}
        <ProfileLinks links={readLinks(receiver.links)} size={20} className="mt-1 justify-center" />
        <hr className="mt-2 w-full border-line" />
      </header>
      </ProfileBar>
      {closedReason ? (
        <section className="flex flex-col gap-2.5 rounded-2xl border border-line bg-card p-3.5" role="status">
          <h2 className="text-[20px] font-semibold leading-tight tracking-[-0.02em]">{closedReason}</h2>
          {note && <p className="whitespace-pre-wrap border-l-2 border-line-2 pl-3 text-[13px]">{note}</p>}
          <p className="text-[13px] text-mute"><E k="closed_note" /></p>
          <ReopenAlert handle={receiver.handle} receiverName={receiver.name} botCheckKey={botKey} />
        </section>
      ) : (
        <SendModes folderBytes={folderBytes} brief={brief} receiverFirstName={firstName} bpmRange={bpmRange} botCheckKey={botKey} handle={receiver.handle} receiverName={receiver.name} callout={open ? open.name : null} genres={genres} allowSharing={sharing && !!collection?.allow_sharing} trackArt={trackArt} termsHash={(await currentTermsOrNull())?.hash} receiverAsksPlay={receiverAsksPlayChoice(receiver.kind)} />
      )}
      {/* Once a file is picked the form says this in one line above Send, so the list steps aside. */}
      {!closedReason && (
      <ul className="flex flex-col gap-2 px-1 group-has-[[data-picked]]/page:hidden" aria-label="What happens to your file">
        {bullets.map(([k, b]) => (
          <li key={k} {...panel(k, "Keep {receiver} as it is: the page fills in the receiver's name.")} className="flex gap-2.5 text-[13px] leading-5 text-mute">
            <Icon name={bulletIcon[k]} className="mt-0.5 size-4 shrink-0" />
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
