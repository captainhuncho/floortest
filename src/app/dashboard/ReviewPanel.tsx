import { CuePoint } from "@/components/CuePoint";
import { currentUser } from "@/lib/auth";
import { canMarkPlayedOut } from "@/lib/played-out-prompt";
import { decisionLocked } from "@/lib/review";
import { ProfileLinks } from "@/components/ProfileLinks";
import { readLinks } from "@/lib/socials";
import Link from "next/link";
import type { PlayerTrack } from "@/components/Player";
import { deletesAt } from "@/lib/plans";
import { playerCover } from "@/lib/covers";
import { asPerson, q, type Collection, type EventRow, type Sender, type Track, now } from "@/lib/db";
import { ago, fmtBytes, fmtDate, fmtDay } from "@/lib/format";
import { MIX_STATUS, AI_USE, RELEASE_STATUS } from "@/lib/plans";
import { featureOn } from "@/lib/features";
import { addNote, decideRelease, deleteTrack, moveTrack, replyToSender } from "./actions/review";
import { NoteForm } from "./ClientBits";
import { DecisionRail } from "./DecisionRail";
import { PlayedOut } from "./PlayedOut";
import { StemsBox } from "./StemsBox";
import { reportTrack } from "./actions/report";
import { atLeast } from "@/lib/account-members";
import { PrepBox } from "./PrepBox";
import { parseCues } from "@/lib/cues";
import { History } from "./History";
import { PanelDetails } from "./PanelDetails";
import { commentsFor, shortlistOf, teamSize } from "@/lib/team";
import { ReviewTogether } from "./ReviewTogether";
import { TrackStepper } from "./review/TrackStepper";
import type { Step } from "./review/QueueState";
import { CardControls, PanelCalls, StoryBars } from "./review/NowReviewing";
import { ReviewInfo } from "./review/ReviewInfo";
import { MoveToProjects } from "./projects/MoveToProjects";
import { listFolders } from "@/lib/library";
import { CARD, Icon, initials } from "@/components/Kit";

export async function ReviewPanel({
  track: t,
  sender,
  collections,
  selfHref,
  next,
  prev,
  position,
}: {
  track: Track;
  sender: Sender;
  collections: Collection[];
  selfHref: string;
  next: Step;
  prev: Step;
  /** "1 of 3": where this track sits in the list on screen. */
  position?: string | null;
}) {
  const receiverPlan = (await q.get<{ plan: string }>("SELECT plan FROM users WHERE id = ?", t.user_id))?.plan ?? "free";
  const stemsOn = await featureOn("stems", { id: t.user_id, plan: receiverPlan });
  const desk = await currentUser();
  // Independent lookups run together, so the next track opens quicker.
  const [events, senderAccount, release, stats, artFrom, team, comments, shortlist] = await Promise.all([
    q.all<EventRow & { track_title: string | null; actor_name: string | null }>(
      `SELECT e.*, t.title AS track_title, (SELECT a.name FROM users a WHERE a.id = e.actor_id AND e.actor_id <> e.user_id) AS actor_name FROM events e LEFT JOIN tracks t ON t.id = e.track_id WHERE e.sender_id = ? ORDER BY e.created_at DESC LIMIT 3`,
      sender.id,
    ),
    // Sent from someone's FloorTest account: show who they are on the platform.
    sender.account_id
      ? q.get<{ handle: string; identity_status: string }>("SELECT handle, identity_status FROM users WHERE id = ? AND suspended_at IS NULL", sender.account_id)
      : Promise.resolve(undefined),
    t.release_id
      ? q.get<{ id: string; title: string; artist: string; kind: string }>("SELECT id, title, artist, kind FROM releases WHERE id = ? AND user_id = ?", t.release_id, t.user_id)
      : Promise.resolve(undefined),
    q.get<{ sent: number; kept: number }>(
      `SELECT COUNT(*) AS sent, COUNT(CASE WHEN decision = 'kept' THEN 1 END) AS kept FROM tracks WHERE sender_id = ?`,
      sender.id,
    ).then((r) => r!),
    // Artwork the sender attached (Team plans); tracks in a folder share the cover the sender attached to the release.
    t.art_key
      ? Promise.resolve({ id: t.id, art_key: t.art_key })
      : t.release_id
        ? q.get<{ id: number; art_key: string }>("SELECT id, art_key FROM tracks WHERE release_id = ? AND user_id = ? AND art_key IS NOT NULL AND deleted_at IS NULL LIMIT 1", t.release_id, t.user_id)
        : Promise.resolve(undefined),
    // Review Together: only when the account has a team.
    teamSize(t.user_id),
    // The team's comments and shortlist read as the signed-in person under the per-person rules (B8).
    desk ? asPerson(desk.actor_id, () => commentsFor(t.id)) : Promise.resolve([]),
    desk ? asPerson(desk.actor_id, () => shortlistOf(t.id)) : Promise.resolve(undefined),
  ]);
  const releaseTracks = release
    ? await q.all<{ id: number; title: string; track_no: number | null; decision: string | null }>(
        "SELECT id, title, track_no, decision FROM tracks WHERE release_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY COALESCE(track_no, 99), created_at",
        release.id, t.user_id,
      )
    : [];
  const player: PlayerTrack = {
    id: t.id,
    title: t.title,
    artist: t.artist,
    peaks: t.peaks ? JSON.parse(t.peaks) : null,
    duration: t.duration,
    played: !!t.played_at,
    // So the floating player's heart shows for a track started from this card.
    decision: t.decision,
    // The track's own artwork or its release's (as this card shows), else the cover of the callout it came in on.
    cover: playerCover({ id: t.id, art_key: t.art_key, collection_id: t.collection_id, callout_art_key: collections.find((c) => c.id === t.collection_id)?.art_key ?? null }, artFrom),
  };
  const removal = deletesAt(t);
  // A track the desk added itself (sent from its own account) can move to Projects; a sender's never can (owner, 13 Nov).
  const ownUpload = !!desk && desk.role !== "member" && sender.account_id === t.user_id && desk.id === t.user_id;
  const projects = ownUpload ? await listFolders(desk) : [];
  const collectionName = collections.find((c) => c.id === t.collection_id)?.name ?? null;

  const releaseBlock = release && (
    <details className="group/rel rounded-[11px] border border-line bg-well">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-2.5 py-2 text-[12px] [&::-webkit-details-marker]:hidden">
        <span className="flex min-w-0 items-center gap-2 truncate">
          <Icon name="folder" className="size-[15px] text-mute" />
          <span className="text-mute">Folder · {releaseTracks.length} tracks</span>
          <span className="truncate font-semibold text-bone">{release.title}</span>
          {release.artist && <span className="truncate text-mute"> · {release.artist}</span>}
        </span>
        <Icon name="down" className="size-4 text-mute transition-transform group-open/rel:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="px-2.5 pb-2.5">
        <ol className="text-[13px]">
          {releaseTracks.map((r, i) => (
            <li key={r.id} className={r.id === t.id ? "font-semibold text-bone" : "text-mute"}>
              <Link href={`/dashboard/review?view=queue&s=all&t=${r.id}`} className="flex min-h-9 items-center hover:text-bone">
                <span className="mr-2 tnum">{r.track_no ?? i + 1}.</span>
                {r.title}
                {r.decision && <span className="ml-2 text-[11px]">{r.decision === "kept" ? "✓ kept" : "passed"}</span>}
              </Link>
            </li>
          ))}
        </ol>
        {releaseTracks.some((r) => !r.decision) && (
          <div className="mt-2 flex flex-wrap gap-2">
            <form action={decideRelease.bind(null, release.id, "kept")}>
              <button className="btn-ghost btn-sm">Keep all undecided</button>
            </form>
            <form action={decideRelease.bind(null, release.id, "passed")}>
              <button className="btn-ghost btn-sm">Not for me: all undecided</button>
            </form>
          </div>
        )}
      </div>
    </details>
  );

  // What the decision needs, in one line: tempo, key, length, genre, mix.
  const length = t.duration ? `${Math.floor(t.duration / 60)}:${String(Math.round(t.duration % 60)).padStart(2, "0")}` : null;
  // One line: genre, tempo, the key only when the sender typed one, length, mix and how long it has waited.
  const info = [
    t.genre,
    t.bpm && `${Math.round(t.bpm)} BPM`,
    t.musical_key,
    length,
    t.mix_status && MIX_STATUS[t.mix_status as keyof typeof MIX_STATUS],
    t.decision ? `arrived ${ago(t.created_at)}` : `waiting ${ago(t.created_at).replace(/ ago$/, "")}`,
  ]
    .filter(Boolean)
    .join(" · ");
  // What this desk's own records say about the sender: how many came before this one, and how many of those were kept.
  const before = stats.sent - 1;
  const keptBefore = stats.kept - (t.decision === "kept" ? 1 : 0);
  const [at, total] = position ? position.split(" of ").map(Number) : [0, 0];
  // The auto-delete date matters at decision time only when it's close.
  const soon = removal && removal - now() < 7 * 86_400_000 ? Math.max(0, Math.ceil((removal - now()) / 86_400_000)) : null;
  // Account teams: who made the call, when it wasn't the account itself (and that a member can't change it).
  const caller =
    t.decision && t.decided_by && t.decided_by !== t.user_id
      ? (await q.get<{ name: string }>("SELECT name FROM users WHERE id = ?", t.decided_by))?.name
      : t.decision && desk && desk.actor_id !== desk.id && t.decided_role === "owner"
        ? desk.name
        : null;
  // Signals that change the decision, as one quiet line of words with no boxes (option 1; owner, 20 Nov). Colour only
  // where something needs attention: red for a likely duplicate, amber for evaluation only and a file about to go. Good
  // news and plain facts are grey.
  const signals = (
    <>
      {t.duplicate_of && (
        <span className="text-danger">
          <span aria-hidden className="mr-1.5 inline-block size-1.5 rounded-full bg-current align-[1px]" />
          Possible duplicate ·{" "}
          <Link href={`/dashboard/review?view=queue&s=all&t=${t.duplicate_of}`} className="underline underline-offset-2">
            Compare
          </Link>
        </span>
      )}
      {t.sets_ok ? <span>OK to play</span> : <span className={AMBER}>Evaluation only</span>}
      {soon !== null && <span className={AMBER}>{soon <= 1 ? "Deletes within a day" : `Deletes in ${soon} days`}</span>}
      {caller && (
        <span>
          {t.decision === "kept" ? "Kept" : "Not for me"} by {caller}
          {desk && decisionLocked(desk, t) ? " · only the owner or an A&R / Admin can change it" : ""}
        </span>
      )}
      {shortlist && <span>Shortlisted</span>}
      {t.release_status && <span>{RELEASE_STATUS[t.release_status as keyof typeof RELEASE_STATUS]}</span>}
      {t.ai_use && t.ai_use !== "none" && <span>{AI_USE[t.ai_use]}</span>}
    </>
  );
  // The sender in one grey line: "From max1max, verified · kept 3 of 8". Only an unchecked email takes colour.
  const senderLine = (
    <span data-sender-line>
      From {sender.name}
      {collectionName ? ` via ${collectionName}` : ""}, {sender.verified_at ? "verified" : <span className={AMBER}>Unverified email</span>}
      {before > 0 && ` · kept ${keptBefore} of ${before}`}
    </span>
  );

  const art = artFrom ? `/api/track-art/${artFrom.id}?v=${encodeURIComponent(artFrom.art_key)}` : null;

  const card = `${CARD} p-3.5 sm:p-4`;
  const commentCount = comments.length;
  const links = readLinks(sender.links);
  const lastListened = events.find((e) => e.type === "played");

  // Info, Track: the file's facts, then the signals as plain sentences.
  const trackInfo = (
    <div className="text-[12.5px]">
      <dl className="divide-y divide-line border-b border-line">
        <Fact label="Format">{`${t.mime === "audio/wav" ? "WAV" : "MP3"} · ${fmtBytes(t.size)}`}</Fact>
        <Fact label="Received">{fmtDate(t.created_at)}</Fact>
        <Fact label="Listened">{t.played_at ? fmtDate(t.played_at) : "Not yet"}</Fact>
        <Fact label="Downloaded">{t.downloaded_at ? fmtDate(t.downloaded_at) : "Not yet"}</Fact>
        <Fact label="Kept until">{removal ? fmtDay(removal) : "You delete it"}</Fact>
        {t.isrc && <Fact label="ISRC">{t.isrc}</Fact>}
        {t.release_status && <Fact label="Release">{RELEASE_STATUS[t.release_status as keyof typeof RELEASE_STATUS]}</Fact>}
        {t.ai_use && t.ai_use !== "none" && <Fact label="AI use">{AI_USE[t.ai_use]}</Fact>}
      </dl>
      <p className="mt-3 leading-relaxed text-mute">
        {t.sets_ok ? "OK to play." : "Evaluation only: ask before playing it out."}
        {removal ? ` Deleted on ${fmtDay(removal)} unless you keep it.` : ""}
      </p>
    </div>
  );

  // Info, Sender: who sent it and what this desk did with them before.
  const senderInfo = (
    <section aria-labelledby={`sender-h-${t.id}`} className="text-[12.5px]">
      <div className="flex items-center justify-between gap-2">
        <h3 id={`sender-h-${t.id}`} className="truncate text-[14px] font-semibold text-bone">
          {sender.name}
        </h3>
        <Link href={`/dashboard/contacts/${sender.id}`} className="inline-flex min-h-11 shrink-0 items-center text-[12.5px] text-mute underline-offset-4 hover:text-bone hover:underline">
          Full history →
        </Link>
      </div>
      <p className="break-all text-mute">
        {sender.email} · {sender.verified_at ? "verified" : <span className={AMBER}>Unverified email</span>}
      </p>
      {senderAccount && (
        <p className="flex flex-wrap items-center gap-x-1.5 text-mute">
          FloorTest user
          <a href={`/${senderAccount.handle}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center font-mono underline-offset-4 hover:text-bone hover:underline">
            /{senderAccount.handle}
          </a>
          {senderAccount.identity_status === "verified" && <span className="inline-flex items-center gap-1 text-bone"><CuePoint size={16} /> Verified</span>}
        </p>
      )}
      <dl className="mt-2 divide-y divide-line border-y border-line">
        <Fact label="Sent before">{before}</Fact>
        <Fact label="You kept">{keptBefore}</Fact>
        {lastListened && (
          <Fact label="Last listened">
            {lastListened.track_title ? `${lastListened.track_title}, ` : ""}
            {fmtDay(lastListened.created_at)}
          </Fact>
        )}
      </dl>
      {links.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <ProfileLinks links={links} size={18} />
          <span className="text-mute">Links not verified</span>
        </div>
      )}
      <NoteForm onNote={addNote.bind(null, sender.id, t.id)} />
      <div className="mt-4 text-[13px]">
        <History events={events} currentTrackId={t.id} />
      </div>
    </section>
  );

  // More, Move to callout: the track's callout, changed in its own layer.
  const moveForm = (
    <form action={moveTrack.bind(null, t.id)} className="flex flex-col gap-3">
      <label className="label block" htmlFor={`move-${t.id}`}>
        Callout
      </label>
      <select id={`move-${t.id}`} name="collection" defaultValue={t.collection_id ?? ""} data-autofocus className="input min-h-11 max-sm:text-base">
        {t.collection_id == null && <option value="">Unsorted</option>}
        {collections.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button className="btn-ghost min-h-11 self-start">
        <Icon name="folder" className="size-4" />
        Move
      </button>
    </form>
  );

  return (
    // Review card option 1 (owner, 20 Nov: "go with option 1 for the review card"): one card holds what the decision
    // needs, the sender's note included, and never grows. Keep, Not for me, Info and More sit on it. Info opens the
    // track's facts and the sender's record (a sheet under 1024px, a drawer beside the card from there); Move, Report
    // and Delete are only in More. A team desk's Review together stays folded under the card.
    <ReviewInfo track={trackInfo} sender={senderInfo}>
      <div className="flex flex-col gap-3">
        <section aria-labelledby={`track-h-${t.id}`} className={`${card} flex flex-col gap-3`}>
          {at && total > 1 && <StoryBars at={at} total={total} />}
          <div className="flex items-center gap-3 lg:items-start lg:gap-4">
            {art ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={art} alt={`Artwork for ${t.title}`} width={96} height={96} className="size-16 shrink-0 rounded-[11px] border border-line object-cover lg:size-24 lg:rounded-[13px]" />
            ) : (
              <div aria-hidden className="grid size-16 shrink-0 place-items-center rounded-[11px] border border-line bg-well text-[20px] font-semibold tracking-[-0.02em] text-mute lg:size-24 lg:rounded-[13px] lg:text-[28px]">
                {initials(t.title)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <h2 id={`track-h-${t.id}`} className="line-clamp-2 text-[17px] font-semibold leading-tight tracking-[-0.02em] text-bone lg:text-[22px]">
                {t.title}
              </h2>
              <p className="mt-0.5 truncate text-[13px] text-mute">{t.artist}</p>
              <p className="mt-1.5 hidden text-[12px] text-mute tnum lg:block">{info}</p>
            </div>
            <div className="hidden shrink-0 items-center gap-2 self-start md:flex">
              {position && <p className="text-[11.5px] text-mute tnum">{position}</p>}
              <TrackStepper fromId={t.id} prev={prev} next={next} position={null} />
            </div>
          </div>
          <p className="-mt-1 text-[12px] text-mute tnum lg:hidden">{info}</p>
          {/* One line of words: the signals, then the sender. They share a line when they fit. */}
          <p className="-mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-mute lg:mt-0">
            {signals}
            <span className="max-lg:w-full">{senderLine}</span>
          </p>
          {t.message && (
            <blockquote aria-label={`${sender.name}'s note`} className="border-l-2 border-line-2 py-px pl-3 text-[13px] leading-relaxed whitespace-pre-wrap text-bone">
              {t.message}
            </blockquote>
          )}
          {releaseBlock}
          <CardControls track={player} prev={prev} next={next} />
          <DecisionRail track={{ ...player, decision: t.decision }} senderName={sender.name} selfHref={selfHref} next={next} prev={prev}>
            <PanelCalls
              trackId={t.id}
              href={selfHref}
              senderName={sender.name}
              onReply={replyToSender.bind(null, sender.id, t.id)}
              move={moveForm}
              project={ownUpload ? <MoveToProjects trackId={t.id} title={t.title} folders={projects.map((f) => ({ id: f.id, name: f.name }))} after={next?.href ?? "/dashboard/projects"} /> : undefined}
              report={{ action: reportTrack.bind(null, t.id), senderName: sender.name, canBlock: !!desk && atLeast(desk.role, "admin") && !sender.blocked_at }}
              onDelete={desk?.role !== "member" ? deleteTrack.bind(null, t.id, next?.href ?? "/dashboard/review") : undefined}
            />
          </DecisionRail>
        </section>

        {t.decision === "kept" && (
          <>
            {desk && canMarkPlayedOut(desk) && (
              <div className={card}>
                <PlayedOut trackId={t.id} senderName={sender.name} at={t.played_out_at} note={t.played_out_note} />
              </div>
            )}
            <PrepBox track={player} energy={t.energy} cues={parseCues(t.cues, t.duration)} />
          </>
        )}

        {stemsOn && <StemsBox track={t} senderName={sender.name} />}

        {/* Team desks: Review together stays where #681 had it, folded under the card (no Team tab yet). */}
        {team > 0 && (
          <PanelDetails
            summary={
              <span className="flex min-w-0 items-center justify-between gap-3">
                <span className="text-[14px] font-semibold tracking-[-0.015em] text-bone">Review together</span>
                <span className="truncate text-[12px] text-mute tnum">{commentCount ? `${commentCount} comment${commentCount === 1 ? "" : "s"}` : "No comments yet"}</span>
              </span>
            }
          >
            <ReviewTogether trackId={t.id} meId={desk?.actor_id ?? t.user_id} canModerate={desk?.role === "owner" || desk?.role === "admin"} comments={comments} shortlistedBy={shortlist?.name ?? null} />
          </PanelDetails>
        )}
      </div>
    </ReviewInfo>
  );
}

/** Amber words: evaluation only, a file about to be deleted, an email that isn't checked. */
const AMBER = "text-[#d98a2b]";

/** One fact in Info: label on the left, value on the right. */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2">
      <dt className="shrink-0 text-mute">{label}</dt>
      <dd className="min-w-0 truncate text-right font-semibold text-bone tnum">{children}</dd>
    </div>
  );
}
