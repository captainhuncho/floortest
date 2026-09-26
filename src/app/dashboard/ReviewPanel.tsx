import Link from "next/link";
import type { PlayerTrack } from "@/components/Player";
import { deletesAt } from "@/lib/core";
import {q, type Collection, type EventRow, type Sender, type Track } from "@/lib/db";
import { fmtBytes, fmtDate, fmtDay } from "@/lib/format";
import { MIX_STATUS, RELEASE_STATUS } from "@/lib/plans";
import { addNote, deleteTrack, moveTrack, replyToSender } from "./actions";
import { ConfirmButton, NoteForm } from "./ClientBits";
import { DecisionRail } from "./DecisionRail";
import { DetailPlayer } from "./DetailPlayer";
import { History } from "./History";

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
  const events = (await q.all<EventRow & { track_title: string | null }>(`SELECT e.*, t.title AS track_title FROM events e LEFT JOIN tracks t ON t.id = e.track_id
       WHERE e.sender_id = ? ORDER BY e.created_at DESC LIMIT 8`, sender.id));
  const stats = (await q.get<{ sent: number; kept: number; downloaded: number }>(`SELECT COUNT(*) AS sent, COUNT(CASE WHEN decision = 'kept' THEN 1 END) AS kept, COUNT(downloaded_at) AS downloaded
       FROM tracks WHERE sender_id = ?`, sender.id))!;
  const player: PlayerTrack = {
    id: t.id,
    title: t.title,
    artist: t.artist,
    peaks: t.peaks ? JSON.parse(t.peaks) : null,
    duration: t.duration,
    played: !!t.played_at,
  };
  const removal = deletesAt(t);

  return (
    <div className="p-5 sm:p-6">
      <p className="label">Now reviewing</p>
      <h2 className="mt-2 text-2xl font-bold leading-tight tracking-tight">{t.title}</h2>
      <p className="mt-1 text-mute">
        {t.artist}
        {t.genre && <span> · {t.genre}</span>}
        {t.release_status && <span> · {RELEASE_STATUS[t.release_status as keyof typeof RELEASE_STATUS]}</span>}
        {t.mix_status && <span> · {MIX_STATUS[t.mix_status as keyof typeof MIX_STATUS]}</span>}
      </p>

      <div className="mt-5">
        <DetailPlayer track={player} />
      </div>

      <div className="mt-5">
        <DecisionRail
          track={{ ...player, decision: t.decision }}
          senderName={sender.name}
          selfHref={selfHref}
          next={next}
          prevHref={prevHref}
          onReply={replyToSender.bind(null, sender.id, t.id)}
        />
      </div>

      {t.message && (
        <figure className="mt-6 rounded-lg border-l-2 border-lime bg-ink p-4">
          <figcaption className="label mb-2">Message from {sender.name}</figcaption>
          <blockquote className="whitespace-pre-wrap">{t.message}</blockquote>
        </figure>
      )}

      <dl className="mt-6 grid grid-cols-4 gap-2 text-center">
        {[
          ["BPM", t.bpm ? Math.round(t.bpm) : "—"],
          ["Length", t.duration ? `${Math.floor(t.duration / 60)}:${String(Math.round(t.duration % 60)).padStart(2, "0")}` : "—"],
          ["Format", t.mime === "audio/wav" ? "WAV" : "MP3"],
          ["Size", fmtBytes(t.size)],
        ].map(([k, v]) => (
          <div key={k} className="rounded-md border border-line px-2 py-2">
            <dt className="label">{k}</dt>
            <dd className="mt-0.5 tnum">{v}</dd>
          </div>
        ))}
      </dl>

      <ul className="mt-4 space-y-1 text-sm text-mute">
        <li>Received {fmtDate(t.created_at)}</li>
        <li>
          {t.played_at ? `Listened ${fmtDate(t.played_at)}` : "Not listened yet"} ·{" "}
          {t.downloaded_at ? `Downloaded ${fmtDate(t.downloaded_at)}` : "Not downloaded"}
        </li>
        <li>{removal ? `File auto-deletes ${fmtDay(removal)} unless kept` : "Kept until you delete it"}</li>
      </ul>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <a href={`/api/tracks/${t.id}/download`} className="btn-ghost btn-sm">
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
        <ConfirmButton
          action={deleteTrack.bind(null, t.id, next?.href ?? "/dashboard")}
          message="Delete this file now? The slot returns. Sender history is kept."
          className="btn btn-sm text-danger hover:bg-danger/10"
        >
          Delete
        </ConfirmButton>
      </div>

      <section className="mt-8 border-t border-line pt-6" aria-labelledby="sender-h">
        <div className="flex items-baseline justify-between">
          <h3 id="sender-h" className="label">
            Sender
          </h3>
          <Link href={`/dashboard/contacts/${sender.id}`} className="text-sm text-mute underline-offset-4 hover:text-bone hover:underline">
            Contact →
          </Link>
        </div>
        <p className="mt-2 font-medium">
          <Link href={`/dashboard/contacts/${sender.id}`} className="underline-offset-4 hover:underline">
            {sender.name}
          </Link>{" "}
          {sender.verified_at ? (
            <span className="chip ml-1 border-lime/50 text-lime">Verified email</span>
          ) : (
            <span className="chip ml-1 border-line text-mute">Unverified email</span>
          )}
        </p>
        <p className="text-sm text-mute">{sender.email}</p>
        <p className="mt-1 text-sm text-mute">
          {stats.sent} sent · {stats.kept} kept · {stats.downloaded} downloaded · since {fmtDay(sender.created_at)}
        </p>
        <NoteForm onNote={addNote.bind(null, sender.id, t.id)} />
        <div className="mt-6">
          <History events={events} currentTrackId={t.id} />
        </div>
      </section>
    </div>
  );
}
