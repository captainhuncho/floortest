import Link from "next/link";
import { q } from "@/lib/db";
import { setContactHandled } from "../actions";

/** Contact-form messages: open ones to deal with, and handled ones kept for reference. */
export default async function Inbox({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const showHandled = (await searchParams).show === "handled";
  const rows = await q.all<{ id: number; name: string; email: string; topic: string; message: string; handled_at: number | null; created_at: number; user_id: number | null; handle: string | null }>(
    `SELECT m.*, u.handle FROM contact_messages m LEFT JOIN users u ON u.id = m.user_id
     WHERE m.handled_at IS ${showHandled ? "NOT NULL" : "NULL"} ORDER BY ${showHandled ? "m.handled_at" : "m.created_at"} DESC LIMIT 200`,
  );
  const open = await q.count("SELECT COUNT(*) AS n FROM contact_messages WHERE handled_at IS NULL");
  const handled = await q.count("SELECT COUNT(*) AS n FROM contact_messages WHERE handled_at IS NOT NULL");
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inbox</h1>
          <p className="mt-2 text-mute">{open} open message{open === 1 ? "" : "s"} from the contact form.</p>
        </div>
        <nav aria-label="Messages" className="flex gap-2">
          {[
            ["/admin/inbox", `Open (${open})`, !showHandled],
            ["/admin/inbox?show=handled", `Handled (${handled})`, showHandled],
          ].map(([href, label, on]) => (
            <Link key={String(href)} href={String(href)} aria-current={on ? "page" : undefined} className={`chip px-3 py-1 ${on ? "border-lime/60 text-lime" : "border-line text-mute hover:text-bone"}`}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
      <ul className="mt-6 space-y-3">
        {rows.map((m) => (
          <li key={m.id} className="rounded-md border border-line p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p>
                <span className="chip mr-2 border-line text-mute">{m.topic}</span>
                <span className="font-medium">{m.name}</span>{" "}
                <a href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: your FloorTest message`)}`} className="text-mute underline-offset-4 hover:text-bone hover:underline">
                  {m.email}
                </a>
                {m.handle && (
                  <Link href={`/admin/accounts/${m.user_id}`} className="ml-2 text-mute hover:text-bone">
                    @{m.handle}
                  </Link>
                )}
              </p>
              <span className="text-sm text-mute">
                {new Date(m.created_at).toLocaleString("en-GB")}
                {m.handled_at && <span className="chip ml-2 border-line text-mute">Handled {new Date(m.handled_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</span>}
              </span>
            </div>
            <p className="mt-3 whitespace-pre-wrap text-sm">{m.message}</p>
            <form action={setContactHandled.bind(null, m.id, !m.handled_at)} className="mt-3">
              <button className="btn-ghost btn-sm">{m.handled_at ? "Reopen" : "Mark handled"}</button>
            </form>
          </li>
        ))}
        {!rows.length && <li className="rounded-md border border-line px-4 py-6 text-mute">{showHandled ? "Nothing handled yet." : "Inbox zero."}</li>}
      </ul>
    </div>
  );
}
