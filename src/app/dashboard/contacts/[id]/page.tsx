import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ownedSender } from "@/lib/core";
import {q, type EventRow, type Track } from "@/lib/db";
import { ago, fmtDate, fmtDay, fmtTime } from "@/lib/format";
import { addNote, blockSender, replyToSender } from "../../actions";
import { Composer, ConfirmButton } from "../../ClientBits";
import { Status } from "../../TrackList";

type Item =
  | { kind: "message"; at: number; text: string; track: string; trackId: number }
  | { kind: "reply" | "note"; at: number; text: string; track: string | null; trackId: number | null };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const s = await ownedSender(user.id, Number((await params).id));
  return { title: `${s?.name ?? "Contact"} — FloorTest` };
}

export default async function Contact({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const s = await ownedSender(user.id, Number((await params).id));
  if (!s) notFound();
  const tracks = (await q.all<Track & { collection_name: string | null }>(`SELECT t.*, c.name AS collection_name FROM tracks t LEFT JOIN collections c ON c.id = t.collection_id
       WHERE t.sender_id = ? ORDER BY t.created_at DESC`, s.id));
  const events = (await q.all<EventRow & { track_title: string | null }>(`SELECT e.*, t.title AS track_title FROM events e LEFT JOIN tracks t ON t.id = e.track_id
       WHERE e.sender_id = ? AND e.type IN ('reply', 'note') ORDER BY e.created_at`, s.id));

  const thread: Item[] = [
    ...tracks.filter((t) => t.message).map((t) => ({ kind: "message" as const, at: t.created_at, text: t.message, track: t.title, trackId: t.id })),
    ...events.map((e) => ({ kind: e.type as "reply" | "note", at: e.created_at, text: e.detail, track: e.track_title, trackId: e.track_id })),
  ].sort((a, b) => a.at - b.at);

  const kept = tracks.filter((t) => t.decision === "kept").length;
  const downloaded = tracks.filter((t) => t.downloaded_at).length;

  return (
    <div className="grid gap-10 px-4 py-6 sm:px-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 max-w-2xl">
        <Link href="/dashboard/contacts" className="text-sm text-mute hover:text-bone">
          ← Contacts
        </Link>
        <h1 className="mt-3 flex flex-wrap items-center gap-2 text-3xl font-bold tracking-tight">
          {s.name}
          {s.verified_at ? (
            <span className="chip border-lime/50 text-lime">Verified email</span>
          ) : (
            <span className="chip border-line text-mute">Unverified email</span>
          )}
          {s.blocked_at && <span className="chip border-danger/50 text-danger">Blocked</span>}
        </h1>
        <p className="text-mute">{s.email}</p>

        <h2 className="label mt-8">Conversation</h2>
        <ol className="mt-4 space-y-4" aria-label="Messages">
          {thread.length === 0 && <li className="text-mute">No messages yet.</li>}
          {thread.map((m, i) => (
            <li key={i} className={`flex ${m.kind === "message" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-4 py-3 ${
                  m.kind === "message" ? "bg-ink-3" : m.kind === "reply" ? "bg-lime/10 ring-1 ring-lime/30" : "border border-dashed border-line"
                }`}
              >
                <p className="mb-1 text-xs text-mute">
                  {m.kind === "message" ? s.name : m.kind === "reply" ? "You, by email" : "Private note"}
                  {m.track && (
                    <>
                      {" "}
                      · about{" "}
                      {m.trackId ? (
                        <Link href={`/dashboard?view=queue&s=all&t=${m.trackId}`} className="underline underline-offset-2 hover:text-bone">
                          {m.track}
                        </Link>
                      ) : (
                        m.track
                      )}
                    </>
                  )}{" "}
                  · {fmtDate(m.at)}
                </p>
                <p className="whitespace-pre-wrap">{m.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-8">
          <Composer senderName={s.name} onNote={addNote.bind(null, s.id, null)} onReply={replyToSender.bind(null, s.id, null)} />
        </div>
      </div>

      <aside className="space-y-8">
        <section>
          <h2 className="label">Tracks from {s.name}</h2>
          <p className="mt-1 text-sm text-mute">
            {tracks.length} sent · {kept} kept · {downloaded} downloaded · since {fmtDay(s.created_at)}
          </p>
          <ul className="mt-3 divide-y divide-line rounded-xl border border-line">
            {tracks.map((t) => (
              <li key={t.id} className="px-4 py-3">
                {t.deleted_at ? (
                  <p className="truncate text-mute line-through">{t.title}</p>
                ) : (
                  <Link href={`/dashboard?view=queue&s=all&t=${t.id}`} className="block truncate font-medium hover:text-lime">
                    {t.title}
                  </Link>
                )}
                <p className="text-sm text-mute">
                  {t.collection_name ?? "Unsorted"} · {fmtTime(t.duration)} · {ago(t.created_at)}
                </p>
                {!t.deleted_at && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <Status row={{ decision: t.decision, played: !!t.played_at, downloaded: !!t.downloaded_at }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
        <section>
          <h2 className="label">Intake</h2>
          <p className="mt-1 text-sm text-mute">
            {s.blocked_at
              ? `Blocked on ${fmtDay(s.blocked_at)}. Uploads from ${s.email} are refused.`
              : `Blocking refuses future uploads from ${s.email}. Existing tracks stay.`}
          </p>
          <ConfirmButton
            action={blockSender.bind(null, s.id, !s.blocked_at)}
            message={s.blocked_at ? `Unblock ${s.name}?` : `Block ${s.name}? They won't be told.`}
            className={`btn btn-sm mt-3 border ${s.blocked_at ? "border-line" : "border-danger/50 text-danger hover:bg-danger/10"}`}
          >
            {s.blocked_at ? "Unblock sender" : "Block sender"}
          </ConfirmButton>
        </section>
      </aside>
    </div>
  );
}
