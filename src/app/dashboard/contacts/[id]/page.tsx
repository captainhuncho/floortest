import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ownedSender } from "@/lib/desk";
import {q, type EventRow, type Track } from "@/lib/db";
import { ago, fmtDate, fmtDay, fmtTime } from "@/lib/format";
import { addNote, blockSender, replyToSender } from "../../actions/review";
import { Composer, ConfirmButton } from "../../ClientBits";
import { PageTitle } from "@/components/PageTitle";
import { TrackRow, TrackTag } from "@/components/TrackRow";

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

  const n = (v: number) => <b className="font-bold text-bone">{v}</b>;

  return (
    <div className="page-gutter grid gap-10 py-4 sm:py-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 max-w-2xl">
        <Link href="/dashboard/contacts" className="tap-text -ml-0.5 inline-flex items-center gap-1.5 text-xs text-mute hover:text-bone">
          <span aria-hidden className="size-3.5 bg-current [mask:url(/icons/arrow-left.svg)_center/contain_no-repeat]" />
          Contacts
        </Link>
        <PageTitle className="mt-2">{s.name}</PageTitle>
        <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-mute">
          <span className="break-all">{s.email}</span>
          <TrackTag>{s.verified_at ? "Verified email" : "Unverified email"}</TrackTag>
          {s.blocked_at && <span className="inline-flex shrink-0 items-center rounded border border-danger/50 px-1.5 py-0.5 text-[11px] font-bold leading-none text-danger">Blocked</span>}
        </p>
        {/* One readout line for the stats. */}
        <p className="mt-3 text-xs text-mute tnum">
          {n(tracks.length)} sent · {n(kept)} kept · {n(downloaded)} downloaded · since {fmtDay(s.created_at, user.tz || undefined)}
        </p>

        <h2 className="eyebrow mt-8">Conversation</h2>
        <ol className="mt-4 space-y-4" aria-label="Messages">
          {thread.length === 0 && <li className="text-mute">No messages yet.</li>}
          {thread.map((m, i) => (
            <li key={i} className={`flex ${m.kind === "message" ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[85%] rounded-xl px-4 py-3 ${
                  m.kind === "message" ? "bg-ink-3" : m.kind === "reply" ? "border border-line-2 bg-ink-2" : "border border-dashed border-line"
                }`}
              >
                <p className="mb-1 text-xs text-mute">
                  {m.kind === "message" ? s.name : m.kind === "reply" ? "You, by email" : "Private note"}
                  {m.track && (
                    <>
                      {" "}
                      · about{" "}
                      {m.trackId ? (
                        <Link href={`/dashboard/review?view=queue&s=all&t=${m.trackId}`} className="underline underline-offset-2 hover:text-bone">
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
        <section aria-labelledby="tracks-h">
          <h2 id="tracks-h" className="eyebrow">
            Tracks from {s.name}
          </h2>
          {tracks.length === 0 ? (
            <p className="mt-3 text-xs text-mute">No tracks yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line border-y border-line">
              {tracks.map((t) => (
                <TrackRow
                  key={t.id}
                  surface="row"
                  title={t.title}
                  href={t.deleted_at ? undefined : `/dashboard/review?view=queue&s=all&t=${t.id}`}
                  sub={[t.collection_name ?? "Unsorted", ago(t.created_at), t.deleted_at ? "deleted" : t.downloaded_at ? "downloaded" : t.played_at ? "listened" : null]
                    .filter(Boolean)
                    .join(" · ")}
                  status={t.deleted_at ? undefined : t.decision === "kept" ? "Kept" : t.decision === "passed" ? "Not for me" : "Needs review"}
                  columns={[{ key: "len", value: fmtTime(t.duration), width: "w-10", label: "Length" }]}
                  className={t.deleted_at ? "opacity-60" : ""}
                />
              ))}
            </ul>
          )}
        </section>
        {user.role !== "member" && (
        <section>
          <h2 className="eyebrow">Intake</h2>
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
        )}
      </aside>
    </div>
  );
}
