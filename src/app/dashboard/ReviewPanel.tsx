import { CuePoint } from "@/components/CuePoint";
import { currentUser } from "@/lib/auth";
import { decisionLocked } from "@/lib/review";
import { ProfileLinks } from "@/components/ProfileLinks";
import { readLinks } from "@/lib/socials";
import Link from "next/link";
import type { PlayerTrack } from "@/components/Player";
import { deletesAt } from "@/lib/plans";
import {q, type Collection, type EventRow, type Sender, type Track, now } from "@/lib/db";
import { ago, fmtBytes, fmtDate, fmtDay } from "@/lib/format";
import { MIX_STATUS, AI_USE, RELEASE_STATUS } from "@/lib/plans";
import { featureOn } from "@/lib/features";
import { addNote, decideRelease, deleteTrack, moveTrack, replyToSender } from "./actions/review";
import { ConfirmButton, NoteForm } from "./ClientBits";
import { DecisionRail } from "./DecisionRail";
import { PlayedOut } from "./PlayedOut";
import { StemsBox } from "./StemsBox";
import { PrepBox } from "./PrepBox";
import { parseCues } from "@/lib/cues";
import { DetailPlayer } from "./DetailPlayer";
import { History } from "./History";
import { PanelDetails } from "./PanelDetails";
import { commentsFor, shortlistOf, teamSize } from "@/lib/team";
import { ReviewTogether } from "./ReviewTogether";
import { TrackStepper } from "./review/TrackStepper";
import type { Step } from "./review/QueueState";
import { ReplyCard } from "./review/ReplyCard";
import { CARD, Chip, Cover, Icon, IconBox, InfoRow, initials } from "@/components/Kit";

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
    q.get<{ sent: number; kept: number; downloaded: number }>(
      `SELECT COUNT(*) AS sent, COUNT(CASE WHEN decision = 'kept' THEN 1 END) AS kept, COUNT(downloaded_at) AS downloaded FROM tracks WHERE sender_id = ?`,
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
    commentsFor(t.id),
    shortlistOf(t.id),
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
  };
  const removal = deletesAt(t);
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
  const meta = [t.bpm && `${Math.round(t.bpm)} BPM`, t.musical_key, length, t.genre, t.mix_status && MIX_STATUS[t.mix_status as keyof typeof MIX_STATUS]].filter(Boolean).join(" · ");
  // The auto-delete date matters at decision time only when it's close.
  const soon = removal && removal - now() < 7 * 86_400_000 ? Math.max(0, Math.ceil((removal - now()) / 86_400_000)) : null;
  // Signals that change the decision stay visible: may it be played out, is it out already, made with AI, a duplicate, going soon.
  // Account teams: who made the call, when it wasn't the account itself (and that a member can't change it).
  const desk = await currentUser();
  const caller =
    t.decision && t.decided_by && t.decided_by !== t.user_id
      ? (await q.get<{ name: string }>("SELECT name FROM users WHERE id = ?", t.decided_by))?.name
      : t.decision && desk && desk.actor_id !== desk.id && t.decided_role === "owner"
        ? desk.name
        : null;
  // Small chips (redesign, 30 Oct): flat for facts, green for good news, amber for what needs attention before deciding,
  // red for a likely mistake.
  const tags = (
    <div className="flex flex-wrap items-center gap-1.5">
      {caller && (
        <Chip>
          {t.decision === "kept" ? "Kept" : "Not for me"} by {caller}
          {desk && decisionLocked(desk, t) ? " · only the owner or an A&R / Admin can change it" : ""}
        </Chip>
      )}
      {t.sets_ok ? <Chip tone="up">Cleared for DJ sets</Chip> : <Chip tone="warn">Evaluation only: ask before playing it out</Chip>}
      {shortlist && (
        <Chip tone="acc">
          <Icon name="star" className="size-3" /> Shortlisted
        </Chip>
      )}
      {t.release_status && <Chip>{RELEASE_STATUS[t.release_status as keyof typeof RELEASE_STATUS]}</Chip>}
      {t.ai_use && t.ai_use !== "none" && <Chip>{AI_USE[t.ai_use]}</Chip>}
      {soon !== null && <Chip tone="warn">{soon <= 1 ? "Deletes within a day" : `Deletes in ${soon} days`} unless you keep it</Chip>}
      {t.duplicate_of && (
        <Chip tone="down">
          Possible duplicate ·{" "}
          <Link href={`/dashboard/review?view=queue&s=all&t=${t.duplicate_of}`} className="underline underline-offset-2">
            Compare
          </Link>
        </Chip>
      )}
    </div>
  );

  const art = artFrom ? `/api/track-art/${artFrom.id}?v=${encodeURIComponent(artFrom.art_key)}` : null;

  const senderLink = (
    <Link href={`/dashboard/contacts/${sender.id}`} className="text-bone underline-offset-4 hover:underline">
      {sender.name}
    </Link>
  );
  const card = `${CARD} p-3.5 sm:p-4`;

  return (
    // Redesign (owner, 30 Oct): the open track is a stack of cards. The player card holds what the decision needs
    // (rendered with the page, so the buttons are there before any JavaScript runs); under it the sender's note and
    // the reply on one side and the folded Details on the other, side by side when there's room.
    <div className="flex flex-col gap-4">
      <section aria-labelledby={`track-h-${t.id}`} className={`${card} flex flex-col gap-3`}>
        <div className="flex items-start gap-3">
          {art ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={art} alt={`Artwork for ${t.title}`} className="size-[46px] shrink-0 rounded-[10px] border border-line object-cover md:size-14" />
          ) : (
            <Cover text={initials(t.title)} size="size-[46px]" />
          )}
          <div className="min-w-0 flex-1">
            <h2 id={`track-h-${t.id}`} className="line-clamp-2 text-[18px] font-semibold leading-tight tracking-[-0.02em] text-bone">
              {t.title}
            </h2>
            <p className="mt-0.5 text-[11.5px] text-mute">
              {[t.artist, collectionName && `for ${collectionName}`, `arrived ${ago(t.created_at)}`].filter(Boolean).join(" · ")}
            </p>
          </div>
          <TrackStepper fromId={t.id} prev={prev} next={next} position={position ?? null} />
        </div>
        {meta && <p className="font-mono text-[11.5px] text-mute tnum">{meta}</p>}
        {tags}
        {releaseBlock}

        <DetailPlayer track={player} />

        <DecisionRail track={{ ...player, decision: t.decision }} senderName={sender.name} selfHref={selfHref} next={next} prev={prev} />
      </section>

      <div className="grid min-w-0 gap-4 md:grid-cols-2 md:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {/* The sender's note, a quote with a hairline edge, under a head that says who sent it and whether their email is checked. */}
          <section aria-labelledby={`from-h-${t.id}`} className={`${card} flex flex-col gap-2.5`}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <IconBox name="mail" small />
                <h3 id={`from-h-${t.id}`} className="truncate text-[15px] font-semibold tracking-[-0.015em] text-bone">
                  From {senderLink}
                </h3>
              </div>
              {sender.verified_at ? (
                <Chip tone="up">
                  <Icon name="check" className="size-3" /> Verified email
                </Chip>
              ) : (
                <Chip tone="warn">Unverified email</Chip>
              )}
            </div>
            {t.message ? (
              <blockquote className="border-l-2 border-line-2 py-px pl-3 text-[13px] leading-relaxed whitespace-pre-wrap text-bone">{t.message}</blockquote>
            ) : (
              <p className="text-[12px] text-mute">No message with this track.</p>
            )}
          </section>

          <section aria-label={`Reply to ${sender.name}`} className={card}>
            <ReplyCard senderName={sender.name} onReply={replyToSender.bind(null, sender.id, t.id)} />
          </section>

          {t.decision === "kept" && (
            <>
              <div className={card}>
                <PlayedOut trackId={t.id} senderName={sender.name} at={t.played_out_at} note={t.played_out_note} />
              </div>
              <PrepBox track={player} energy={t.energy} cues={parseCues(t.cues, t.duration)} />
            </>
          )}

          {team > 0 && <ReviewTogether trackId={t.id} meId={desk?.actor_id ?? t.user_id} canModerate={desk?.role === "owner" || desk?.role === "admin"} comments={comments} shortlistedBy={shortlist?.name ?? null} />}

          {stemsOn && <StemsBox track={t} senderName={sender.name} />}
        </div>

        <PanelDetails
          summary={
            <span className="flex min-w-0 items-center justify-between gap-2">
              <span className="flex items-center gap-2">
                <IconBox name="music" small />
                <span className="text-[15px] font-semibold tracking-[-0.015em] text-bone">Details</span>
              </span>
              <span className="truncate text-[11.5px] text-mute">file, dates, move, delete, sender</span>
            </span>
          }
        >
          <dl className="flex flex-col gap-1.5">
            <InfoRow icon="folder" label="Collection">{collectionName ?? "Unsorted"}</InfoRow>
            <InfoRow icon="wave" label="Format">{`${t.mime === "audio/wav" ? "WAV" : "MP3"} · ${fmtBytes(t.size)}`}</InfoRow>
            <InfoRow icon="clock" label="Received">{fmtDate(t.created_at)}</InfoRow>
            <InfoRow icon="head" label="Listened">{t.played_at ? fmtDate(t.played_at) : "Not yet"}</InfoRow>
            <InfoRow icon="dl" label="Downloaded">{t.downloaded_at ? fmtDate(t.downloaded_at) : "Not yet"}</InfoRow>
            <InfoRow icon="cal" label="Kept until">{removal ? fmtDay(removal) : "You delete it"}</InfoRow>
            {t.isrc && <InfoRow icon="tag" label="ISRC">{t.isrc}</InfoRow>}
          </dl>
          {removal && <p className="mt-1.5 px-0.5 text-[11.5px] text-mute">Then deleted unless you keep it.</p>}

          <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
            <a
              href={`/api/tracks/${t.id}/download`}
              className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-line bg-well px-3 text-[13px] font-semibold text-bone hover:border-line-2"
            >
              <Icon name="dl" className="size-4" />
              Download original
            </a>
            <form action={moveTrack.bind(null, t.id)} className="flex min-h-11 min-w-0">
              <label className="sr-only" htmlFor={`move-${t.id}`}>
                Collection
              </label>
              <select
                id={`move-${t.id}`}
                name="collection"
                defaultValue={t.collection_id ?? ""}
                className="min-w-0 flex-1 rounded-l-xl border border-line bg-well px-2.5 text-[13px] text-bone max-sm:text-base"
              >
                {t.collection_id == null && <option value="">Unsorted</option>}
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button className="inline-flex items-center gap-1.5 rounded-r-xl border border-l-0 border-line bg-well px-3 text-[13px] font-semibold text-bone hover:border-line-2">
                <Icon name="folder" className="size-4" />
                Move
              </button>
            </form>
          </div>
          {desk?.role !== "member" && (
            <div className="mt-1.5 flex justify-end">
              <ConfirmButton
                action={deleteTrack.bind(null, t.id, next?.href ?? "/dashboard/review")}
                message="Delete this file now? The slot returns. Sender history is kept."
                className="btn btn-sm text-danger hover:bg-danger/10"
              >
                Delete
              </ConfirmButton>
            </div>
          )}

          <section className="mt-4 border-t border-line pt-3" aria-labelledby="sender-h">
            <div className="flex items-center justify-between gap-2">
              <h3 id="sender-h" className="flex items-center gap-2 text-[13px] font-semibold text-bone">
                <Icon name="user" className="size-[15px] text-mute" />
                Sender
              </h3>
              <Link href={`/dashboard/contacts/${sender.id}`} className="inline-flex min-h-9 items-center text-[12px] text-mute underline-offset-4 hover:text-bone hover:underline">
                Full history →
              </Link>
            </div>
            <p className="mt-1 text-[12px] break-all text-mute">{sender.email}</p>
            {readLinks(sender.links).length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <ProfileLinks links={readLinks(sender.links)} size={18} />
                <span title="Anyone can paste a profile link. FloorTest hasn't checked these belong to the sender.">
                  <Chip>Links not verified</Chip>
                </span>
              </div>
            )}
            {senderAccount && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[12px]">
                <Chip tone="acc">FloorTest user</Chip>
                <a href={`/${senderAccount.handle}`} target="_blank" rel="noreferrer" className="font-mono text-mute underline-offset-4 hover:text-bone hover:underline">
                  /{senderAccount.handle}
                </a>
                {senderAccount.identity_status === "verified" && <span className="inline-flex items-center gap-1 text-lime"><CuePoint size={16} /> Verified</span>}
              </p>
            )}
            <p className="mt-1.5 text-[12px] text-mute tnum">
              {stats.sent} sent · {stats.kept} kept · {stats.downloaded} downloaded · since {fmtDay(sender.created_at)}
            </p>
            <NoteForm onNote={addNote.bind(null, sender.id, t.id)} />
            <div className="mt-4 text-[13px]">
              <History events={events} currentTrackId={t.id} />
            </div>
          </section>
        </PanelDetails>
      </div>
    </div>
  );
}
