import { trackUse } from "@/lib/usage";
import { atLeast, canRunCallouts } from "@/lib/account-members";
import { canCapCallouts } from "@/lib/desk";
import { switchOn } from "@/lib/switches";
import { notFound } from "next/navigation";
import { requireUser, viewingAs } from "@/lib/auth";
import { calloutBlock, capacity, collectionsFor, isClosed } from "@/lib/desk";
import { asPerson, now, q } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { genresFor, MIX_STATUS } from "@/lib/plans";
import { briefItems } from "@/lib/brief";
import { calloutCovers, collectionArtUrl } from "@/lib/covers";
import { DownloadActions } from "../../DownloadActions";
import { LinkRow } from "../../floor/FloorClient";
import { APP_URL } from "@/lib/mail";
import Link from "next/link";
import { Icon, InfoRow } from "@/components/Kit";
import { ListRows, type ListRow } from "../../list/ListRows";
import { LIST_COLUMNS, type ListTrack } from "../../rows";
import { CalloutTools, DeleteCollection, EditCollectionInfo } from "../CollectionForms";
import { fmtLength, FolderPage, WIDE } from "../FolderPage";
import { CalloutState, trackCount } from "../FolderRow";
import { PlayAll } from "../PlayAll";
import { toPlayer } from "@/lib/player-track";
import { shareCardTarget } from "../callout-card";
import { CollapsiblePanel } from "./CollapsiblePanel";
import { ShareLinks, type ShareLinkView } from "../ShareLinks";
import { linksFor, sharingOn } from "@/lib/share-links";

export const metadata = { title: "Collection — FloorTest" };

/**
 * A callout's folder page (owner, 17 Nov: option 43; the same page as a project's): a big cover, its name, its facts in
 * one or two lines, shuffle and play, "Review N new", then every track in it, numbered, with its status. Its details
 * (brief, dates, download, edit), share links and delete come after the tracks.
 */
export default async function CollectionFolder({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  await trackUse(user.id, "collection");
  const { id } = await params;
  const all = await collectionsFor(user.id);
  const c = all.find((x) => String(x.id) === id);
  if (!c) notFound();
  const receiving = c.id === user.active_collection_id;
  const genres = genresFor(c);
  // Team and link controls are for the owner and admins (their actions check this too).
  const admin = atLeast(user.role, "admin");
  // Editing a callout: owner, A&R / Admin, or a Member an admin ticked (owner, 16 Nov).
  const callouts = await canRunCallouts(user);
  // Share links (behind the "sharing" switch): only while sharing is switched on.
  const links = admin && (await sharingOn()) ? await linksFor(user, c.id) : null;
  // Track and sender reads run under the per-person rules (B8) as well as the desk filter; share links stay the app's.
  const asMe = <T,>(fn: () => Promise<T>) => asPerson(user.actor_id, fn);
  const sharedTracks = links ? Number((await asMe(() => q.get<{ n: number }>("SELECT COUNT(*)::int AS n FROM tracks WHERE collection_id = ? AND deleted_at IS NULL AND share_ok = 1 AND share_terms IS NOT NULL", c.id)))?.n ?? 0) : 0;

  const tracks = await asMe(() =>
    q.all<ListTrack & { sender_name: string; sender_email: string; sender_verified: number | null }>(
      `SELECT ${LIST_COLUMNS}, s.name AS sender_name, s.email AS sender_email, s.verified_at AS sender_verified
         FROM tracks t JOIN senders s ON s.id = t.sender_id
         WHERE t.user_id = ? AND t.collection_id = ? AND t.deleted_at IS NULL ORDER BY t.created_at DESC LIMIT 500`,
      user.id,
      c.id,
    ),
  );
  const cards: ListRow[] = tracks.map((t) => ({
    id: t.id,
    title: t.title,
    artist: t.artist,
    sender: t.sender_name,
    senderId: t.sender_id,
    senderEmail: t.sender_email,
    senderVerified: !!t.sender_verified,
    meta: [t.genre || null, t.bpm ? `${Math.round(t.bpm)} BPM` : null].filter(Boolean) as string[],
    mixLabel: MIX_STATUS[t.mix_status as keyof typeof MIX_STATUS] ?? null,
    duplicateOf: t.duplicate_of,
    message: t.message,
    duration: t.duration,
    peaks: t.peaks ? JSON.parse(t.peaks) : null,
    decision: t.decision,
    played: !!t.played_at,
    downloaded: !!t.downloaded_at,
    replied: !!t.replied_at,
    createdAt: t.created_at,
  }));
  const editable = {
    id: c.id,
    name: c.name,
    closesAt: c.closes_at,
    closesLabel: c.closes_at ? fmtDay(c.closes_at) : null,
    count: c.count,
    needsReview: c.needs_review,
    kept: c.kept,
    briefWanted: c.brief_wanted,
    bpmMin: c.bpm_min,
    bpmMax: c.bpm_max,
    briefNote: c.brief_note,
    allowSharing: !!c.allow_sharing,
    sharingAvailable: await switchOn("sharing"),
    maxTracks: c.max_tracks,
    full: !!c.full_at,
    art: c.art_key ? collectionArtUrl(c.id, c.art_key) : null,
    covers: (await calloutCovers(user)).get(c.id) ?? [],
    canCap: canCapCallouts(user.plan),
    genres: genres.custom ? genres.list : [],
    brief: briefItems(c, genres.custom ? genres.list : [], user.tz),
  };
  const brief = editable.brief;
  const closed = isClosed(c);
  const live = receiving && !closed;
  // The share card is the account owner's only, for now; staff viewing as someone get no card.
  const card = live
    ? shareCardTarget({ isOwner: user.role === "owner", viewingAs: !!(await viewingAs()), active: c, blocked: !!calloutBlock(user, c, (await capacity(user)).full) })
    : undefined;
  const readout = [`${c.needs_review} to review`, `${c.kept} kept`, `${c.count} received`, !closed && c.closes_at ? `closes ${fmtDay(c.closes_at)}` : null].filter(Boolean).join(" · ");

  // The mock's detail card: the numbers, the brief, the facts as rows, the link while it's receiving, then the actions.
  const details = (
    <CollapsiblePanel collectionId={c.id} summary={readout}>
      <div className="border-t border-dashed border-line-2" />
      <div>
        <h3 className="mb-1.5 text-[11.5px] text-mute">Brief</h3>
        {brief.length ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[12px]">
            {brief.map((b) => (
              <div key={b.key} className="contents">
                <dt className="text-mute">{b.label}</dt>
                <dd className={b.key === "note" ? "italic text-bone" : "font-semibold text-bone tnum"}>{b.text}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-[12px] text-mute">No brief yet. Use Edit collection to add BPM, genres, what you want and a note for senders.</p>
        )}
      </div>
      <div className="border-t border-dashed border-line-2" />
      <dl className="flex flex-col gap-1.5">
        <InfoRow icon="cal" label="Opened">{fmtDay(c.created_at)}</InfoRow>
        <InfoRow icon="clock" label={closed ? "Closed" : "Closes"}>{c.closes_at ? fmtDay(c.closes_at) : "No date"}</InfoRow>
        {c.max_tracks ? <InfoRow icon="inbox" label="Track cap"><span className="tnum">{c.count} of {c.max_tracks}</span></InfoRow> : null}
        {editable.sharingAvailable && <InfoRow icon="lock" label="Private sharing">{c.allow_sharing ? "On" : "Off"}</InfoRow>}
      </dl>
      {live && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11.5px] text-mute">Your link sends here</p>
          <LinkRow link={`${APP_URL}/${user.handle}`} card={card} />
        </div>
      )}
      {/* The shared download pair, laid out side by side and full width in this card. */}
      <div className="[&>div]:flex! [&>div]:gap-2 [&>div>*]:min-w-0 [&>div>*]:flex-1 [&_.btn-lime]:min-h-11 [&>div>a]:min-h-11 [&>div>span]:min-h-11">
        <DownloadActions collectionId={c.id} crateName={c.name} count={c.count} quiet />
      </div>
      <div className="flex flex-wrap gap-2 [&>button]:min-h-11 [&>button]:min-w-0 [&>button]:flex-1">
        {callouts && <EditCollectionInfo c={editable} receiving={receiving} closed={closed} />}
        {/* No Add tracks on a callout (owner, 16 Nov: "keep it for Projects only"): senders send through the link, and
            your own tracks are added on a project's page. */}
      </div>
    </CollapsiblePanel>
  );

  // The total length only when every track is on the page (the list stops at 500) and each has a length stored.
  const whole = cards.length === c.count && cards.every((t) => t.duration);
  const length = whole && cards.length ? cards.reduce((sum, t) => sum + (t.duration ?? 0), 0) : 0;

  return (
    <FolderPage
      back={{ href: "/dashboard/collections", label: "Collections" }}
      tools={<CalloutTools c={editable} receiving={receiving} closed={closed} canManage={admin} canEdit={callouts} link={live ? `${APP_URL}/${user.handle}` : undefined} card={card} />}
      covers={editable.covers}
      empty={c.count === 0 && editable.covers.length === 0}
      name={c.name}
      lines={[
        `Callout · ${trackCount(c.count)}${length ? ` · ${fmtLength(length)}` : ""}`,
        <>
          <CalloutState live={live} closed={closed} full={!!c.full_at} closesLabel={editable.closesLabel} />
          {!closed && c.closes_at ? ` · closes ${fmtDay(c.closes_at)}` : ""}
          {c.max_tracks ? ` · ${c.count} of ${c.max_tracks}` : ""}
        </>,
      ]}
      play={<PlayAll queue={cards.map(toPlayer)} name={c.name} />}
      action={
        c.needs_review > 0 && (
          <Link href={`/dashboard/review?view=queue&c=${c.id}`} className={WIDE}>
            <Icon name="inbox" className="size-4" />
            Review {c.needs_review} new
          </Link>
        )
      }
    >
      <section aria-labelledby="tracks-h" className="flex flex-col gap-2">
        <h2 id="tracks-h" className="sr-only">
          Tracks
        </h2>
        {/* One list for every screen size, so keyboard shortcuts and the player are registered once. */}
        {cards.length ? (
          <ListRows rows={cards} statusTag numbered collections={all.map((x) => ({ id: x.id, name: x.name }))} />
        ) : (
          <p className="text-[12.5px] text-mute">No tracks yet. Tracks sent while it&apos;s receiving land here.</p>
        )}
      </section>
      {links && <ShareLinks collectionId={c.id} links={links as ShareLinkView[]} sharedTracks={sharedTracks} at={now()} />}
      {details}
      {admin && <DeleteCollection c={{ id: c.id, name: c.name }} canDelete={all.length > 1} />}
    </FolderPage>
  );
}
