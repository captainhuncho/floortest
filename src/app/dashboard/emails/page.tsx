import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { q } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { CARD, Chip, Icon, PageHead, SectionHead } from "@/components/Kit";
import { EmptyState, Notice } from "@/components/Feedback";

type Mail = { id: number; to_email: string; subject: string; body: string; status: string; created_at: number };

export const metadata = { title: "Emails to senders — FloorTest" };

/** The outbox's status in words a receiver can act on (src/lib/mail.ts sets the raw values). */
function statusOf(raw: string): { label: string; tone: "up" | "down" | "flat" } {
  if (raw === "sent") return { label: "Sent", tone: "up" };
  if (raw.startsWith("failed") || raw.startsWith("dropped")) return { label: "Not delivered", tone: "down" };
  if (raw.startsWith("skipped")) return { label: "Not sent: refused earlier", tone: "flat" };
  if (raw === "queued" || raw === "sending") return { label: "Sending", tone: "flat" };
  return { label: "Saved here only", tone: "flat" };
}

/** Everything FloorTest emailed senders on this desk's behalf: receipts, replies, signals. Newest first, last 200. */
export default async function Emails() {
  const user = await requireRole("admin");
  const mails = await q.all<Mail>(
    "SELECT id, to_email, subject, body, status, created_at FROM outbox WHERE user_id = ? AND audience = 'sender' ORDER BY created_at DESC LIMIT 200",
    user.id,
  );
  const live = !!process.env.RESEND_API_KEY;
  const undelivered = mails.filter((m) => m.status.startsWith("failed") || m.status.startsWith("dropped")).length;
  return (
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4">
        <Link href="/dashboard/account" className="tap-text -ml-0.5 inline-flex w-fit items-center gap-1.5 text-[12px] text-mute hover:text-bone md:hidden">
          <Icon name="chev" className="size-3.5 rotate-180" />
          <span>
            <span className="sr-only">Back to </span>Account
          </span>
        </Link>
        <PageHead label="What FloorTest told senders on your behalf, newest first." title="Emails to senders" />
        {!live && (
          <Notice tone="info" title="These emails weren't sent">
            Email isn&apos;t switched on for this copy of FloorTest, so senders weren&apos;t emailed. Each one is kept here so you can see what they would have got.
          </Notice>
        )}
        {undelivered > 0 && (
          <Notice tone="error" title={`${undelivered} ${undelivered === 1 ? "email wasn't" : "emails weren't"} delivered`}>
            The sender&apos;s address turned it away or couldn&apos;t be reached. Their private receipt still shows everything, so nothing is lost.
          </Notice>
        )}
        <section aria-labelledby="mails-h" className={`${CARD} flex flex-col gap-1 p-3`}>
          <SectionHead id="mails-h" icon="mail" title="Sent" aside={mails.length ? <span className="tnum">{mails.length}</span> : undefined} />
          {mails.length === 0 ? (
            <EmptyState icon="mail" action={{ href: "/dashboard/review", label: "Open the Review Queue" }}>
              Nothing sent yet. When you keep, reply to or play out a track, the sender&apos;s email shows here.
            </EmptyState>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {mails.map((m) => {
                const st = statusOf(m.status);
                return (
                  <li key={m.id}>
                    <details className="group">
                      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-[11px] px-1 py-2.5 hover:bg-well [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold text-bone">{m.subject}</span>
                          <span className="block truncate text-[11.5px] text-mute">
                            to {m.to_email}
                            <span className="sm:hidden"> · {fmtDate(m.created_at)}</span>
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-[11.5px] text-mute">
                          <Chip tone={st.tone}>{st.label}</Chip>
                          <span className="hidden tnum sm:inline">{fmtDate(m.created_at)}</span>
                          <Icon name="chev" className="size-3.5 transition-transform group-open:rotate-90" />
                        </span>
                      </summary>
                      <pre className="mb-2 mt-1 whitespace-pre-wrap rounded-[11px] border border-line bg-well p-3 font-sans text-[12.5px] leading-[1.5] text-mute">{m.body}</pre>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
