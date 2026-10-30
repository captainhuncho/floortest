import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ownedSender } from "@/lib/desk";
import { q, type EventRow, type Track } from "@/lib/db";
import { ago, fmtDate, fmtDay, fmtTime } from "@/lib/format";
import { addNote, blockSender, replyToSender } from "../../actions/review";
import { Composer, ConfirmButton } from "../../ClientBits";
import { CARD, Chip, Cover, Icon, InfoRow, SectionHead, initials } from "@/components/Kit";

type Item =
  | { kind: "message"; at: number; text: string; track: string; trackId: number }
  | { kind: "reply" | "note"; at: number; text: string; track: string | null; trackId: number | null };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const s = await ownedSender(user, Number((await params).id));
  return { title: `${s?.name ?? "Contact"} — FloorTest` };
}

export default async function Contact({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const s = await ownedSender(user, Number((await params).id));
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
  const tz = user.tz || undefined;
  // Tracks come newest first: the first is the latest send, the last the first one.
  const lastSent = tracks[0]?.created_at;
  const firstSent = tracks[tracks.length - 1]?.created_at;

  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col gap-4">
        <Link href="/dashboard/contacts" className="tap-text -ml-0.5 inline-flex w-fit items-center gap-1.5 text-[12px] text-mute hover:text-bone">
          <Icon name="chev" className="size-3.5 rotate-180" />
          Contacts
        </Link>

        {/* Phones: one column, the person first. From 1024px the person and the conversation on the left, their tracks on the right. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div className="flex min-w-0 flex-col gap-4">
            <section aria-labelledby="contact-h" className={`${CARD} flex flex-col gap-3 p-3`}>
              <div className="flex items-center gap-3">
                <Cover text={initials(s.name)} size="size-[52px] rounded-[14px]! text-[16px]!" />
                <div className="min-w-0 flex-1">
                  <h1 id="contact-h" className="truncate text-[22px] font-semibold leading-tight tracking-[-0.025em] text-bone">
                    {s.name}
                  </h1>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-mute">
                    <span className="break-all">{s.email}</span>
                    {s.verified_at ? (
                      <Chip tone="acc">
                        <Icon name="check" className="size-3" />
                        Verified email
                      </Chip>
                    ) : (
                      <Chip>Unverified email</Chip>
                    )}
                    {s.blocked_at && <Chip tone="down">Blocked</Chip>}
                  </p>
                </div>
              </div>
              {/* The three numbers, then the dates: one readout, no stat tiles. */}
              <dl className="grid grid-cols-3 border-b border-dashed border-line-2 pb-2.5 text-center tnum">
                {(
                  [
                    ["Sent", tracks.length],
                    ["Kept", kept],
                    ["Downloaded", downloaded],
                  ] as const
                ).map(([label, v]) => (
                  <div key={label} className="flex flex-col-reverse">
                    <dd className="mt-0.5 text-[14px] font-semibold text-bone">{v}</dd>
                    <dt className="text-[11.5px] text-mute">{label}</dt>
                  </div>
                ))}
              </dl>
              <dl className="flex flex-col gap-1.5">
                <InfoRow icon="user" label="Contact since">{fmtDay(s.created_at, tz)}</InfoRow>
                {firstSent && tracks.length > 1 && <InfoRow icon="cal" label="First sent">{fmtDay(firstSent, tz)}</InfoRow>}
                {lastSent && <InfoRow icon="clock" label="Last sent">{fmtDay(lastSent, tz)}</InfoRow>}
              </dl>
              <a href={`mailto:${s.email}`} className="btn-ghost btn-sm gap-1.5 bg-well">
                <Icon name="mail" className="size-4" />
                Email
              </a>
            </section>

            <section aria-labelledby="conversation-h" className={`${CARD} flex flex-col gap-3 p-3`}>
              <SectionHead id="conversation-h" icon="reply" title="Conversation" />
              <ol className="flex flex-col gap-1.5" aria-label="Messages">
                {thread.length === 0 && <li className="text-[12px] text-mute">No messages yet.</li>}
                {thread.map((m, i) => (
                  <li
                    key={i}
                    className={`flex flex-col gap-1 rounded-[11px] border px-2.5 py-2 text-[12.5px] ${
                      m.kind === "message" ? "border-line bg-well" : m.kind === "reply" ? "border-transparent bg-lime/12" : "border-dashed border-line-2"
                    }`}
                  >
                    <p className="text-[11px] text-mute">
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
                    <p className="whitespace-pre-wrap leading-[1.45] text-bone">{m.text}</p>
                  </li>
                ))}
              </ol>
              <Composer senderName={s.name} onNote={addNote.bind(null, s.id, null)} onReply={replyToSender.bind(null, s.id, null)} />
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <section aria-labelledby="tracks-h" className={`${CARD} flex flex-col gap-1 p-3`}>
              <SectionHead id="tracks-h" icon="music" title={`Tracks from ${s.name}`} />
              {tracks.length === 0 ? (
                <p className="py-3 text-[12px] text-mute">No tracks yet.</p>
              ) : (
                <ul className="flex flex-col">
                  {tracks.map((t) => {
                    const status = t.deleted_at ? null : t.decision === "kept" ? "Kept" : t.decision === "passed" ? "Not for me" : "Needs review";
                    const sub = [t.collection_name ?? "Unsorted", ago(t.created_at), t.deleted_at ? "deleted" : t.downloaded_at ? "downloaded" : t.played_at ? "listened" : null]
                      .filter(Boolean)
                      .join(" · ");
                    const inner = (
                      <>
                        <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-line bg-well text-bone">
                          <Icon name="music" className="size-4" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate text-[12.5px] font-semibold text-bone">{t.title}</span>
                          <span className="truncate text-[11.5px] text-mute">{sub}</span>
                        </span>
                        <span className="shrink-0 text-[11px] text-faint tnum">
                          <span className="sr-only">Length </span>
                          {fmtTime(t.duration)}
                        </span>
                        {status && <Chip tone={status === "Kept" ? "up" : status === "Needs review" ? "warn" : "flat"}>{status}</Chip>}
                      </>
                    );
                    return (
                      <li key={t.id} className={`border-t border-line first:border-t-0 ${t.deleted_at ? "opacity-60" : ""}`}>
                        {t.deleted_at ? (
                          <div className="flex min-h-11 items-center gap-2.5 py-2">{inner}</div>
                        ) : (
                          <Link
                            href={`/dashboard/review?view=queue&s=all&t=${t.id}`}
                            className="-mx-1.5 flex min-h-11 items-center gap-2.5 rounded-[10px] px-1.5 py-2 transition-colors duration-150 hover:bg-well motion-reduce:transition-none"
                          >
                            {inner}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
            {user.role !== "member" && (
              <section aria-labelledby="intake-h" className={`${CARD} flex flex-col gap-2.5 p-3`}>
                <SectionHead id="intake-h" icon="shield" title="Intake" />
                <p className="text-[12px] leading-[1.5] text-mute">
                  {s.blocked_at
                    ? `Blocked on ${fmtDay(s.blocked_at)}. Uploads from ${s.email} are refused.`
                    : `Blocking refuses future uploads from ${s.email}. Existing tracks stay.`}
                </p>
                <ConfirmButton
                  action={blockSender.bind(null, s.id, !s.blocked_at)}
                  message={s.blocked_at ? `Unblock ${s.name}?` : `Block ${s.name}? They won't be told.`}
                  className={`btn btn-sm gap-1.5 border bg-well ${s.blocked_at ? "border-line text-bone hover:border-mute" : "border-line text-danger hover:border-danger/50 hover:bg-danger/10"}`}
                >
                  {!s.blocked_at && <Icon name="x" className="size-4" />}
                  {s.blocked_at ? "Unblock sender" : "Block sender"}
                </ConfirmButton>
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
