import { CuePoint } from "@/components/CuePoint";
import { currentUser } from "@/lib/auth";
import { decisionLocked } from "@/lib/review";
import { ProfileLinks } from "@/components/ProfileLinks";
import { readLinks } from "@/lib/socials";
import Link from "next/link";
import type { PlayerTrack } from "@/components/Player";
import { deletesAt } from "@/lib/plans";
import {q, type Collection, type EventRow, type Sender, type Track, now } from "@/lib/db";
import { fmtBytes, fmtDate, fmtDay } from "@/lib/format";
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
import { DesktopOnly, MobileOnly } from "./DesktopOnly";
import { MobileTransport } from "./MobileTransport";
import { History } from "./History";
import { PanelDetails } from "./PanelDetails";
import { commentsFor, shortlistOf, teamSize } from "@/lib/team";
import { ReviewTogether } from "./ReviewTogether";

export async function ReviewPanel({
  track: t,
  sender,
  collections,
  selfHref,
  next,
  prevHref,
}: {
  track: Track;
  sender: Sender;
  collections: Collection[];
  selfHref: string;
  next: { href: string; track: PlayerTrack } | null;
  prevHref: string | null;
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

  const releaseBlock = release && (
    <details className="group/rel mt-3 rounded-md border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-3 text-sm [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 truncate">
          <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-mute">Folder · {releaseTracks.length} tracks</span>{" "}
          <span className="font-semibold">{release.title}</span>
          {release.artist && <span className="text-mute"> · {release.artist}</span>}
        </span>
        <span aria-hidden className="shrink-0 text-mute group-open/rel:rotate-180">▾</span>
      </summary>
      <div className="px-3 pb-3">
        <ol className="space-y-0.5 text-sm">
          {releaseTracks.map((r, i) => (
            <li key={r.id} className={r.id === t.id ? "font-semibold text-bone" : "text-mute"}>
              <Link href={`/dashboard/review?view=queue&s=all&t=${r.id}`} className="hover:text-bone">
                <span className="tnum mr-2">{r.track_no ?? i + 1}.</span>
                {r.title}
                {r.decision && <span className="ml-2 text-[11px]">{r.decision === "kept" ? "✓ kept" : "passed"}</span>}
              </Link>
            </li>
          ))}
        </ol>
        {releaseTracks.some((r) => !r.decision) && (
          <div className="mt-3 flex flex-wrap gap-2">
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
  const tags = (
    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
      {caller && (
        <span className="rounded-full border border-line px-2.5 py-0.5 text-mute">
          {t.decision === "kept" ? "Kept" : "Not for me"} by {caller}
          {desk && decisionLocked(desk, t) ? " · only the owner or an A&R / Admin can change it" : ""}
        </span>
      )}
      <span className={`rounded-full border px-2.5 py-0.5 ${t.sets_ok ? "border-lime/50 text-lime" : "border-line text-mute"}`}>
        {t.sets_ok ? "Cleared for DJ sets" : "Evaluation only: ask before playing it out"}
      </span>
      {shortlist && <span className="rounded-full border border-lime/50 px-2.5 py-0.5 text-lime">★ Shortlisted</span>}
      {t.release_status && <span className="rounded-full border border-line px-2.5 py-0.5 text-mute">{RELEASE_STATUS[t.release_status as keyof typeof RELEASE_STATUS]}</span>}
      {t.ai_use && t.ai_use !== "none" && <span className="rounded-full border border-line-2 px-2.5 py-0.5 uppercase tracking-[0.5px] text-mute">{AI_USE[t.ai_use]}</span>}
      {soon !== null && <span className="rounded-full border border-danger/50 px-2.5 py-0.5 text-danger">{soon <= 1 ? "Deletes within a day" : `Deletes in ${soon} days`} unless you keep it</span>}
      {t.duplicate_of && (
        <span className="rounded-full border border-danger/50 px-2.5 py-0.5 text-danger">
          Possible duplicate ·{" "}
          <Link href={`/dashboard/review?view=queue&s=all&t=${t.duplicate_of}`} className="underline underline-offset-2">
            Compare
          </Link>
        </span>
      )}
    </div>
  );

  const art = artFrom ? `/api/track-art/${artFrom.id}?v=${encodeURIComponent(artFrom.art_key)}` : null;

  return (
    <div className="p-4 sm:p-6" data-swipe-zone>
      {/* Phones: Figma "08 Full Player / DJ Review" */}
      <div className="md:hidden">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={art ?? "/icons/review-art.svg"} alt="" className="size-[52px] shrink-0 rounded object-cover" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 className="truncate text-base font-bold text-bone">{t.title}</h2>
            <p className="truncate text-xs text-mute">
              {t.artist}
              {t.isrc && <span title="ISRC"> · {t.isrc}</span>}
            </p>
          </div>
        </div>
        {meta && <p className="mt-3 text-[13px] font-bold text-bone tnum">{meta}</p>}
        {tags}
        {releaseBlock}
        <MobileTransport track={player} prevHref={prevHref} nextHref={next?.href ?? null} />
        {/* The rail mounts after the screen size is known (one rail, one set of shortcuts); its room is kept so nothing jumps. */}
        <div className="mt-3.5 min-h-[100px]">
          <MobileOnly>
          <DecisionRail
            track={{ ...player, decision: t.decision }}
            senderName={sender.name}
            selfHref={selfHref}
            next={next}
            prevHref={prevHref}
            onReply={replyToSender.bind(null, sender.id, t.id)}
          />
          </MobileOnly>
        </div>
      </div>

      <div className="hidden md:block">
      {art && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={art} alt={`Artwork for ${t.title}`} className="mb-4 size-40 rounded-md border border-line object-cover" />
      )}
      <p className="label">Now reviewing</p>
      <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight">{t.title}</h2>
      <p className="mt-1 text-mute">{t.artist}</p>
      {meta && <p className="mt-1 font-bold tnum">{meta}</p>}
      {tags}
      {releaseBlock}

      <div className="mt-5">
        <DetailPlayer track={player} />
      </div>

      <div className="mt-5 min-h-[92px]">
        <DesktopOnly>
          <DecisionRail
            track={{ ...player, decision: t.decision }}
            senderName={sender.name}
            selfHref={selfHref}
            next={next}
            prevHref={prevHref}
            onReply={replyToSender.bind(null, sender.id, t.id)}
          />
        </DesktopOnly>
      </div>
      </div>

      {t.decision === "kept" && (
        <>
          <div className="mt-4">
            <PlayedOut trackId={t.id} senderName={sender.name} at={t.played_out_at} note={t.played_out_note} />
          </div>
          <div className="mt-4">
            <PrepBox track={player} energy={t.energy} cues={parseCues(t.cues, t.duration)} />
          </div>
        </>
      )}


      {team > 0 && <ReviewTogether trackId={t.id} meId={desk?.actor_id ?? t.user_id} canModerate={desk?.role === "owner" || desk?.role === "admin"} comments={comments} shortlistedBy={shortlist?.name ?? null} />}


      {stemsOn && (
        <div className="mt-4">
          <StemsBox track={t} senderName={sender.name} />
        </div>
      )}

      {t.message && (
        <figure className="mt-6 rounded-lg border border-line bg-ink p-4">
          <figcaption className="label mb-2">Message from {sender.name}</figcaption>
          <blockquote className="whitespace-pre-wrap">{t.message}</blockquote>
        </figure>
      )}

      <p className="mt-6 text-sm">
        From{" "}
        <Link href={`/dashboard/contacts/${sender.id}`} className="font-medium underline-offset-4 hover:underline">
          {sender.name}
        </Link>{" "}
        {sender.verified_at ? (
          <span className="chip ml-1 border-lime/50 text-lime">Verified email</span>
        ) : (
          <span className="chip ml-1 border-line text-mute">Unverified email</span>
        )}
      </p>

      <PanelDetails summary={<span>Details <span className="hidden text-mute sm:inline">· file, dates, move, delete, sender</span></span>}>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {[
            ["Format", `${t.mime === "audio/wav" ? "WAV" : "MP3"} · ${fmtBytes(t.size)}`],
            ["Received", fmtDate(t.created_at)],
            ["Listened", t.played_at ? fmtDate(t.played_at) : "Not yet"],
            ["Downloaded", t.downloaded_at ? fmtDate(t.downloaded_at) : "Not yet"],
            ["Kept until", removal ? `${fmtDay(removal)}, then deleted unless you keep it` : "You delete it"],
            ...(t.isrc ? [["ISRC", t.isrc]] : []),
          ].map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-mute">{k}</dt>
              <dd className="tnum">{v}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {/* Phones already have Download on the decision rail. */}
          <a href={`/api/tracks/${t.id}/download`} className="btn-ghost btn-sm hidden md:inline-flex">
            Download original
          </a>
          <form action={moveTrack.bind(null, t.id)} className="flex">
            <label className="sr-only" htmlFor={`move-${t.id}`}>
              Collection
            </label>
            <select
              id={`move-${t.id}`}
              name="collection"
              defaultValue={t.collection_id ?? ""}
              className="rounded-l-md border border-line bg-ink-2 px-2 py-1.5 text-sm text-bone"
            >
              {t.collection_id == null && <option value="">Unsorted</option>}
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button className="rounded-r-md border border-l-0 border-line px-3 text-sm text-mute hover:text-bone">Move</button>
          </form>
          {desk?.role !== "member" && (
            <ConfirmButton
              action={deleteTrack.bind(null, t.id, next?.href ?? "/dashboard/review")}
              message="Delete this file now? The slot returns. Sender history is kept."
              className="btn btn-sm text-danger hover:bg-danger/10"
            >
              Delete
            </ConfirmButton>
          )}
        </div>

        <section className="mt-6 border-t border-line pt-4" aria-labelledby="sender-h">
          <div className="flex items-baseline justify-between">
            <h3 id="sender-h" className="label">
              Sender
            </h3>
            <Link href={`/dashboard/contacts/${sender.id}`} className="text-sm text-mute underline-offset-4 hover:text-bone hover:underline">
              Full history →
            </Link>
          </div>
          <p className="mt-2 text-sm text-mute">{sender.email}</p>
          {readLinks(sender.links).length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <ProfileLinks links={readLinks(sender.links)} size={18} />
              <span className="chip border-line text-mute" title="Anyone can paste a profile link. FloorTest hasn't checked these belong to the sender.">
                Links not verified
              </span>
            </div>
          )}
          {senderAccount && (
            <p className="mt-1 text-sm">
              <span className="chip border-lime/40 text-lime">FloorTest user</span>{" "}
              <a href={`/${senderAccount.handle}`} target="_blank" rel="noreferrer" className="font-mono text-mute underline-offset-4 hover:text-bone hover:underline">
                /{senderAccount.handle}
              </a>
              {senderAccount.identity_status === "verified" && <span className="ml-1.5 inline-flex items-center gap-1 text-lime"><CuePoint size={16} /> Verified</span>}
            </p>
          )}
          <p className="mt-1 text-sm text-mute">
            {stats.sent} sent · {stats.kept} kept · {stats.downloaded} downloaded · since {fmtDay(sender.created_at)}
          </p>
          <NoteForm onNote={addNote.bind(null, sender.id, t.id)} />
          <div className="mt-4">
            <History events={events} currentTrackId={t.id} />
          </div>
        </section>
      </PanelDetails>
    </div>
  );
}
