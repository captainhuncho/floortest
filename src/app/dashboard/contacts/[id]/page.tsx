import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ownedSender } from "@/lib/desk";
import { contactHistory, MAX_MESSAGES, MAX_TRACKS, TRACK_PAGE, tracksShown } from "@/lib/contact";
import { ago, fmtDate, fmtDay, fmtTime } from "@/lib/format";
import { addNote, blockSender, replyToSender } from "../../actions/review";
import { Composer, ConfirmButton } from "../../ClientBits";
import { Cover, Icon, initials } from "@/components/Kit";
import { ContactMore } from "./ContactMore";
import { DANGER_TEXT, QSEG, qsegTab, shortDate, Status, statusOf } from "../ui";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const s = await ownedSender(user, Number((await params).id));
  return { title: `${s?.name ?? "Contact"} — FloorTest` };
}

/** One of the three equal actions under the header: 60px tall, icon over a word. */
const ACTION =
  "flex min-h-[60px] flex-1 flex-col items-center justify-center gap-1 rounded-[14px] border border-line bg-well text-[12px] font-semibold text-bone hover:border-line-2 lg:min-h-11 lg:flex-row lg:gap-2 lg:text-[13px]";

export default async function Contact({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ n?: string; tab?: string; compose?: string }> }) {
  const user = await requireUser();
  const s = await ownedSender(user, Number((await params).id));
  if (!s) notFound();
  const sp = await searchParams;
  const shown = tracksShown(sp.n);
  // Phones show one tab at a time; it lives in the address so back works and a link can open Tracks. From 1024px both show.
  const tab = sp.tab === "tracks" ? "tracks" : "conversation";
  const composeNote = sp.compose === "note";
  // The numbers count every track this person sent; the list and the conversation are the latest ones only (1 Nov).
  const { sent, kept, downloaded, firstSent, tracks, thread, olderMessages } = await contactHistory(user.actor_id, s.id, shown);
  const tz = user.tz || undefined;
  const member = user.role === "member";
  const base = `/dashboard/contacts/${s.id}`;
  const tabHref = (t: "conversation" | "tracks") => {
    const p = new URLSearchParams();
    if (t === "tracks") p.set("tab", "tracks");
    if (sp.n) p.set("n", sp.n);
    return `${base}${p.size ? `?${p}` : ""}`;
  };
  const blockAction = blockSender.bind(null, s.id, !s.blocked_at);

  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-[1040px] min-w-0 flex-col gap-3">
        <Link href="/dashboard/contacts" className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 px-1 text-[14px] text-mute hover:text-bone">
          <Icon name="chev" className="size-4 rotate-180" />
          Contacts
        </Link>

        {/* Phones: one column, the person, then Conversation or Tracks. From 1024px the person and the conversation on the left, their tracks on the right (380px). */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-5">
          <div className="flex min-w-0 flex-col gap-4">
            <header className="flex flex-col items-center gap-1 pb-1 text-center lg:items-start lg:rounded-[16px] lg:border lg:border-line lg:bg-card lg:p-4 lg:text-left">
              <Cover text={initials(s.name)} size="size-16 rounded-full! text-[20px]!" />
              <h1 className="mt-1.5 max-w-full truncate text-[24px] font-semibold leading-tight tracking-[-0.025em] text-bone">{s.name}</h1>
              <p className="flex max-w-full flex-wrap items-center justify-center gap-x-1.5 text-[13px] text-mute lg:justify-start">
                <span className="break-all">{s.email}</span>
                {s.verified_at ? (
                  <span className="flex text-lime">
                    <Icon name="check" className="size-3.5" />
                    <span className="sr-only">Verified</span>
                  </span>
                ) : (
                  <span className="text-faint">· Unverified email</span>
                )}
              </p>
              {s.blocked_at && <p className={`text-[13px] font-semibold ${DANGER_TEXT}`}>Blocked</p>}
              {/* One readout line in place of the number tiles and date rows. Contact since only when nothing was sent. */}
              <p className="mt-1 text-[13px] text-mute tnum">
                {sent > 0 ? (
                  <>
                    <b className="font-semibold text-bone">{sent}</b> sent · <b className="font-semibold text-bone">{kept}</b> kept · <b className="font-semibold text-bone">{downloaded}</b> downloaded
                    {firstSent && <> · first sent {shortDate(firstSent, tz)}</>}
                  </>
                ) : (
                  <>Contact since {fmtDay(s.created_at, tz)}</>
                )}
              </p>
              <div role="group" aria-label={`Actions for ${s.name}`} className="mt-3 flex w-full max-w-[340px] gap-2.5 lg:max-w-none">
                <a href={`mailto:${s.email}`} className={ACTION}>
                  <Icon name="mail" className="size-5 text-mute lg:size-4" />
                  Email
                </a>
                <Link href={`${base}?compose=note#composer`} className={ACTION}>
                  <svg aria-hidden viewBox="0 0 24 24" className="size-5 text-mute lg:size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 20h4L19 9l-4-4L4 16z" />
                    <path d="M13.5 6.5l4 4" />
                  </svg>
                  Note
                </Link>
                <ContactMore name={s.name} email={s.email} block={member ? undefined : { action: blockAction, blocked: !!s.blocked_at }} className={ACTION}>
                  <svg aria-hidden viewBox="0 0 24 24" className="size-5 text-mute lg:size-4" fill="currentColor">
                    <circle cx="5" cy="12" r="1.6" />
                    <circle cx="12" cy="12" r="1.6" />
                    <circle cx="19" cy="12" r="1.6" />
                  </svg>
                  More
                </ContactMore>
              </div>
            </header>

            <nav aria-label={s.name} className={`${QSEG} lg:hidden`}>
              <Link href={tabHref("conversation")} aria-current={tab === "conversation" ? "page" : undefined} className={qsegTab(tab === "conversation")}>
                Conversation
              </Link>
              <Link href={tabHref("tracks")} aria-current={tab === "tracks" ? "page" : undefined} className={qsegTab(tab === "tracks")}>
                Tracks <span className="font-normal text-faint tnum">{sent}</span>
              </Link>
            </nav>

            <section aria-labelledby="conversation-h" className={`${tab === "conversation" ? "flex" : "hidden"} min-w-0 flex-col gap-3 lg:flex`}>
              <h2 id="conversation-h" className="sr-only text-[13px] font-semibold text-mute lg:not-sr-only">
                Conversation
              </h2>
              {olderMessages && <p className="text-[12px] text-mute">Showing the latest {MAX_MESSAGES} messages.</p>}
              <ol className="flex flex-col gap-2" aria-label="Messages">
                {thread.length === 0 && <li className="text-[13px] leading-[1.5] text-mute">No messages yet. Email {s.name} below, or keep a private note only you can see.</li>}
                {thread.map((m, i) => (
                  <li
                    key={i}
                    className={`flex flex-col gap-0.5 rounded-xl border px-3 py-2 text-[14px] ${
                      m.kind === "message" ? "border-line bg-well" : m.kind === "reply" ? "border-transparent bg-lime/10" : "border-dashed border-line-2"
                    }`}
                  >
                    <p className="text-[12px] text-mute">
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
              <Composer
                key={composeNote ? "note" : "reply"}
                initialMode={composeNote ? "note" : "reply"}
                senderName={s.name}
                onNote={addNote.bind(null, s.id, null)}
                onReply={replyToSender.bind(null, s.id, null)}
              />
            </section>
          </div>

          <div className={`${tab === "tracks" ? "flex" : "hidden"} min-w-0 flex-col gap-4 lg:flex`}>
            <section aria-labelledby="tracks-h" className="flex flex-col lg:rounded-[16px] lg:border lg:border-line lg:bg-card lg:p-3.5">
              <h2 id="tracks-h" className="sr-only text-[13px] font-semibold text-mute lg:not-sr-only lg:pb-1">
                Tracks from {s.name}
              </h2>
              {tracks.length === 0 ? (
                <p className="py-3 text-[13px] leading-[1.5] text-mute">No tracks from {s.name} on this desk any more. What you said to each other stays in the conversation.</p>
              ) : (
                <ul className="flex flex-col">
                  {tracks.map((t) => {
                    const status = statusOf(t);
                    const sub = [t.collection_name ?? "Unsorted", ago(t.created_at), t.deleted_at ? "deleted" : t.downloaded_at ? "downloaded" : t.played_at ? "listened" : null]
                      .filter(Boolean)
                      .join(" · ");
                    const inner = (
                      <>
                        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[10px] border border-line bg-well text-bone">
                          <Icon name="music" className="size-4" />
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <span className="truncate text-[14px] font-semibold text-bone">{t.title}</span>
                          <span className="truncate text-[12px] text-mute">{sub}</span>
                        </span>
                        <span className="shrink-0 text-[12px] text-faint tnum">
                          <span className="sr-only">Length </span>
                          {fmtTime(t.duration)}
                        </span>
                        {status && <Status status={status} />}
                      </>
                    );
                    return (
                      <li key={t.id} className={`border-b border-line last:border-b-0 ${t.deleted_at ? "opacity-50" : ""}`}>
                        {t.deleted_at ? (
                          <div className="flex min-h-[60px] items-center gap-3 py-2">{inner}</div>
                        ) : (
                          <Link href={`/dashboard/review?view=queue&s=all&t=${t.id}`} className="flex min-h-[60px] items-center gap-3 py-2">
                            {inner}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {sent > tracks.length && tracks.length < MAX_TRACKS && (
                <Link
                  href={`${base}?tab=tracks&n=${shown + TRACK_PAGE}#tracks-h`}
                  className="flex min-h-11 items-center justify-center border-t border-line text-[13px] font-semibold text-mute hover:text-bone"
                >
                  Show more ({tracks.length} of {sent})
                </Link>
              )}
            </section>
            {!member && (
              <section aria-labelledby="intake-h" className="flex flex-col items-start gap-2 lg:rounded-[16px] lg:border lg:border-line lg:bg-card lg:p-3.5">
                <h2 id="intake-h" className="text-[13px] font-semibold text-mute">
                  Intake
                </h2>
                <p className="text-[13px] leading-[1.5] text-mute">
                  {s.blocked_at
                    ? `Blocked on ${fmtDay(s.blocked_at)}. Uploads from ${s.email} are refused.`
                    : `Blocking refuses future uploads from ${s.email}. Existing tracks stay.`}
                </p>
                <ConfirmButton
                  action={blockAction}
                  message={s.blocked_at ? `Unblock ${s.name}? They can send to your link again.` : `Block ${s.name}? They can't send to your link any more, and they won't be told. You can unblock them here.`}
                  confirmLabel={s.blocked_at ? "Unblock" : "Block sender"}
                  danger={!s.blocked_at}
                  className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-line bg-well px-3.5 text-[14px] font-semibold hover:border-line-2 sm:text-[13px] ${s.blocked_at ? "text-bone" : DANGER_TEXT}`}
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
