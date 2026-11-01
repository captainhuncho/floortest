import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { now as clock, q } from "@/lib/db";
import { setContactHandled } from "../actions";
import { OpsForm } from "../OpsForm";

const DAY = 86_400_000;
/** Messages longer than this fold behind "Show the whole message". */
const FOLD_AT = 280;
/** One colour per kind of message, so a glance tells billing from account help (pin 151's tones). */
const TOPIC_TONE = ["#d5ff48", "#c9c1ff", "#f7b6a8", "#ffd98a", "#a8e6cf"];

type Msg = { id: number; name: string; email: string; topic: string; message: string; handled_at: number | null; created_at: number; user_id: number | null; handle: string | null };

/**
 * Contact-form messages, laid out like pin 101 (owner, 1 Nov): Open / Handled as a pill switch, messages grouped by
 * day, each a card with who wrote, about what, when, the message in a quiet block, and the two things you do with it.
 * In-app feedback has its own board.
 */
export default async function Inbox({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireAdmin("inbox.read");
  const showHandled = (await searchParams).show === "handled";
  const t = clock();
  const [rows, open, handled] = await Promise.all([
    q.all<Msg>(
      `SELECT m.id, m.name, m.email, m.topic, m.message, m.handled_at, m.created_at, m.user_id, u.handle
       FROM contact_messages m LEFT JOIN users u ON u.id = m.user_id
       WHERE m.topic NOT LIKE 'Feedback%' AND m.handled_at IS ${showHandled ? "NOT NULL" : "NULL"} ORDER BY ${showHandled ? "m.handled_at" : "m.created_at"} DESC LIMIT 200`,
    ),
    q.count("SELECT COUNT(*) AS n FROM contact_messages WHERE topic NOT LIKE 'Feedback%' AND handled_at IS NULL"),
    q.count("SELECT COUNT(*) AS n FROM contact_messages WHERE topic NOT LIKE 'Feedback%' AND handled_at IS NOT NULL"),
  ]);
  const startOfToday = t - (t % DAY);
  const groups = [
    { label: "Today", items: rows.filter((m) => m.created_at >= startOfToday) },
    { label: "Yesterday", items: rows.filter((m) => m.created_at >= startOfToday - DAY && m.created_at < startOfToday) },
    { label: "Earlier", items: rows.filter((m) => m.created_at < startOfToday - DAY) },
  ].filter((g) => g.items.length);
  const topics = [...new Set(rows.map((m) => m.topic))];
  const tone = (topic: string) => TOPIC_TONE[topics.indexOf(topic) % TOPIC_TONE.length];
  const ago = (ms: number) => {
    const m = Math.floor((t - ms) / 60_000);
    return m < 60 ? `${Math.max(1, m)}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  };

  return (
    <div className="space-y-6">
      <header className="admin-rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-bone ring-1 ring-line-2">Support</span>
          <h1 className="mt-3 text-[34px] font-semibold leading-tight tracking-[-0.03em]">Inbox</h1>
          <p className="mt-1 text-[15px] text-mute">
            {open ? `${open} message${open === 1 ? "" : "s"} waiting for a reply from the contact form.` : "Nothing waiting. Every message has an answer."}
          </p>
        </div>
        {/* The pill switch (pin 101's Unread / Read / Archived). */}
        <nav aria-label="Messages" className="inline-flex rounded-full bg-ink-2 p-1 ring-1 ring-line">
          {[
            ["/admin/inbox", "Open", open, !showHandled],
            ["/admin/inbox?show=handled", "Handled", handled, showHandled],
          ].map(([href, label, n, on]) => (
            <Link
              key={String(href)}
              href={String(href)}
              aria-current={on ? "page" : undefined}
              className={`admin-press flex min-h-11 items-center gap-2 rounded-full px-5 text-[13.5px] font-semibold ${on ? "bg-bone text-ink" : "text-mute hover:text-bone"}`}
            >
              {String(label)}
              <span className={`rounded-full px-1.5 text-[11px] tnum ${on ? "bg-ink/10" : "bg-ink-4"}`}>{Number(n)}</span>
            </Link>
          ))}
        </nav>
      </header>

      {groups.length ? (
        groups.map((g, gi) => (
          <section key={g.label} aria-labelledby={`day-${gi}`} className="space-y-3">
            <h2 id={`day-${gi}`} className="admin-rise flex items-center gap-2 text-[15px] font-semibold" style={{ "--i": gi } as React.CSSProperties}>
              {g.label}
              <span className="rounded-full bg-ink-4 px-2 text-[11.5px] font-semibold text-mute tnum">{g.items.length}</span>
            </h2>
            <ul className="space-y-3">
              {g.items.map((m, i) => (
                <li key={m.id} className="admin-panel admin-rise p-5" style={{ "--i": gi + i + 1 } as React.CSSProperties}>
                  <div className="flex items-start gap-3">
                    <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-full text-[13px] font-bold text-ink" style={{ background: tone(m.topic) }}>
                      {m.name
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0]?.toUpperCase())
                        .join("")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-baseline gap-x-2 text-[14.5px]">
                        <b className="font-semibold">{m.name}</b>
                        <span className="text-mute">wrote about</span>
                        <b className="font-semibold">{m.topic}</b>
                        {m.handle && (
                          <Link href={`/admin/accounts/${m.user_id}`} className="text-[13px] text-mute hover:text-bone">
                            @{m.handle}
                          </Link>
                        )}
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-faint">
                        {ago(m.created_at)} · {m.email}
                        {m.handled_at && ` · handled ${new Date(m.handled_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}`}
                      </p>
                    </div>
                    {!m.handled_at && <span aria-label="Waiting for a reply" className="mt-2 size-2.5 shrink-0 rounded-full bg-lime" />}
                  </div>
                  {/* The message in a quiet inset block; long ones fold. */}
                  <div className="mt-4 rounded-[14px] bg-ink-3 px-4 py-3 text-[14px] leading-relaxed">
                    {m.message.length > FOLD_AT ? (
                      <details className="group">
                        <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                          <span className="whitespace-pre-wrap group-open:hidden">{m.message.slice(0, FOLD_AT)}…</span>
                          <span className="mt-2 block min-h-11 content-center text-[13px] font-semibold text-mute group-open:hidden">Show the whole message</span>
                        </summary>
                        <p className="whitespace-pre-wrap">{m.message}</p>
                      </details>
                    ) : (
                      <p className="whitespace-pre-wrap">{m.message}</p>
                    )}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <a
                      href={`mailto:${m.email}?subject=${encodeURIComponent("Re: your FloorTest message")}`}
                      className="admin-press inline-flex min-h-11 items-center rounded-full bg-lime px-5 text-[13.5px] font-semibold text-ink hover:brightness-95"
                    >
                      Reply by email
                    </a>
                    <OpsForm action={setContactHandled.bind(null, m.id, !m.handled_at)}>
                      <button className="admin-press inline-flex min-h-11 items-center rounded-full px-5 text-[13.5px] font-semibold text-bone ring-1 ring-line-2 hover:bg-ink-3">
                        {m.handled_at ? "Reopen" : "Mark handled"}
                      </button>
                    </OpsForm>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      ) : (
        <p className="admin-panel admin-rise p-6 text-[15px] text-mute">{showHandled ? "Nothing handled yet." : "Inbox zero. Nothing is waiting for a reply."}</p>
      )}
    </div>
  );
}
