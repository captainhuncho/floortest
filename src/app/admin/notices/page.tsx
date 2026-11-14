import Link from "next/link";
import { requireAdmin } from "@/lib/admin";
import { now } from "@/lib/db";
import { DETAIL_MAX, noticeById, noticesForAdmin, noticeWindow, TITLE_MAX, type NoticeRow } from "@/lib/site-notices";
import { endNotice, saveNotice } from "../actions";
import { ConfirmButton } from "../AdminUi";
import { PageHead } from "../PinParts";
import { NoticeTimes } from "./NoticeTimes";

type State = "live" | "upcoming" | "past";
const stateOf = (n: NoticeRow, at: number): State => (n.ended_at !== null || n.hide_after <= at ? "past" : n.show_from <= at ? "live" : "upcoming");

/**
 * Ops → Notices (Desk, 13 Nov): a short notice of upcoming work, shown as a thin strip at the top of the signed-in
 * dashboard from "show from" until "hide after". Plain text only; at most one shows at a time, the soonest.
 */
export default async function Notices({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const a = await requireAdmin("announcements");
  const sp = await searchParams;
  const at = now();
  const [rows, editing] = await Promise.all([noticesForAdmin(), sp.edit ? noticeById(Number(sp.edit)) : null]);
  const edit = editing && stateOf(editing, at) !== "past" ? editing : null;
  const tz = a.tz || "UTC";
  const groups: { key: State; title: string; rows: NoticeRow[] }[] = [
    { key: "live", title: "Showing now", rows: rows.filter((n) => stateOf(n, at) === "live").reverse() },
    { key: "upcoming", title: "Upcoming", rows: rows.filter((n) => stateOf(n, at) === "upcoming").reverse() },
    { key: "past", title: "Past", rows: rows.filter((n) => stateOf(n, at) === "past") },
  ];

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Growth" title="Notices">
        A thin strip at the top of the dashboard for everyone signed in, such as a short update window. One shows at a time: the soonest.
      </PageHead>

      <section aria-labelledby="form-h" className="admin-panel space-y-4 p-5">
        <h2 id="form-h" className="text-[15px] font-semibold">
          {edit ? "Edit notice" : "New notice"}
        </h2>
        <form action={saveNotice} className="space-y-3">
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <label className="block space-y-1.5">
            <span className="label">Title (up to {TITLE_MAX} characters)</span>
            <input name="title" required maxLength={TITLE_MAX} defaultValue={edit?.title ?? ""} className="input" placeholder="Short update" />
          </label>
          <label className="block space-y-1.5">
            <span className="label">One line of detail (optional, up to {DETAIL_MAX})</span>
            <input name="detail" maxLength={DETAIL_MAX} defaultValue={edit?.detail ?? ""} className="input" placeholder="Uploads pause for a few minutes." />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Link inside FloorTest (optional)</span>
            <input name="href" pattern="/.*" defaultValue={edit?.href ?? ""} className="input" placeholder="/help" />
          </label>
          <NoticeTimes key={edit?.id ?? "new"} values={edit ?? undefined} />
          <p className="text-[12.5px] text-mute">Plain text only, no exclamation marks. Times show to each person in their own time zone.</p>
          <div className="flex flex-wrap items-center gap-3">
            <button className="admin-press inline-flex min-h-11 items-center rounded-full bg-lime px-5 text-[13.5px] font-semibold text-ink">{edit ? "Save notice" : "Add notice"}</button>
            {edit && (
              <Link href="/admin/notices" className="inline-flex min-h-11 items-center rounded-full px-5 text-[13.5px] font-semibold ring-1 ring-line-2 hover:bg-ink-3">
                Cancel
              </Link>
            )}
          </div>
        </form>
      </section>

      {groups.map((g) => (
        <section key={g.key} aria-labelledby={`${g.key}-h`} className="space-y-3">
          <h2 id={`${g.key}-h`} className="flex items-center gap-2 text-[15px] font-semibold">
            {g.title}
            <span className="rounded-full bg-ink-4 px-2 text-[11.5px] font-semibold text-mute tnum">{g.rows.length}</span>
          </h2>
          {g.rows.length === 0 ? (
            <p className="text-[13.5px] text-mute">None.</p>
          ) : (
            <ul className="space-y-2">
              {g.rows.map((n) => (
                <li key={n.id} className="admin-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold">
                      {n.title} <span className="font-normal text-mute">{noticeWindow(n, tz)}</span>
                    </p>
                    {n.detail && <p className="mt-0.5 text-[13.5px] text-mute">{n.detail}</p>}
                    <p className="mt-1 text-[12.5px] text-faint">
                      Shows {noticeWindow({ starts_at: n.show_from, ends_at: n.hide_after }, tz)}
                      {n.href ? ` · links to ${n.href}` : ""}
                      {n.ended_at !== null ? " · ended early" : ""}
                    </p>
                  </div>
                  {g.key !== "past" && (
                    <div className="flex shrink-0 gap-2">
                      <Link href={`/admin/notices?edit=${n.id}`} className="inline-flex min-h-11 items-center rounded-full px-4 text-[13px] font-semibold ring-1 ring-line-2 hover:bg-ink-3">
                        Edit
                      </Link>
                      <ConfirmButton
                        action={endNotice.bind(null, n.id)}
                        message={`End "${n.title}" now? It stops showing straight away.`}
                        confirmLabel="End now"
                        className="inline-flex min-h-11 items-center rounded-full px-4 text-[13px] font-semibold ring-1 ring-line-2 hover:bg-ink-3"
                      >
                        End early
                      </ConfirmButton>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
