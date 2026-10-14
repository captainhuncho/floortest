import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { NO_TRACK_DAYS, NOT_JOINED_DAYS, partnerRows, QUIET_DAYS, type PartnerRow } from "@/lib/partners";
import { savePartnerNote } from "../actions";
import { now as clock } from "@/lib/db";

export const metadata = { title: "Beta partners — FloorTest admin" };

const DAY = 86_400_000;
const ago = (t: number | null, now: number) => {
  if (!t) return "—";
  const d = Math.floor((now - t) / DAY);
  return d <= 0 ? "Today" : d === 1 ? "Yesterday" : `${d}d ago`;
};
const STAGES: PartnerRow["stage"][] = ["Invited", "Joined", "Receiving", "Reviewing"];

/** Every beta account and unused personal invite: how far each person has got, who needs a nudge, and call notes. */
export default async function Partners({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  await requireAdmin("partners.read");
  const show = (await searchParams).show;
  const now = clock();
  const all = await partnerRows(now);
  const rows = show === "stuck" ? all.filter((r) => r.flag) : STAGES.includes(show as PartnerRow["stage"]) ? all.filter((r) => r.stage === show) : all;
  const count = (s: PartnerRow["stage"]) => all.filter((r) => r.stage === s).length;
  const stuck = all.filter((r) => r.flag).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Beta partners</h1>
        <p className="mt-2 max-w-2xl text-mute">
          Everyone in the beta and every personal invite not used yet. Flags: no track {NO_TRACK_DAYS} days after joining (probably hasn&apos;t shared their link),
          quiet for {QUIET_DAYS} days, or invited {NOT_JOINED_DAYS}+ days ago without joining. Notes are only for admins.
        </p>
      </div>

      <nav aria-label="Filter" className="flex flex-wrap gap-2">
        {[
          [undefined, `Everyone (${all.length})`],
          ["stuck", `Needs a nudge (${stuck})`],
          ...STAGES.map((s) => [s, `${s} (${count(s)})`]),
        ].map(([v, label]) => (
          <Link
            key={String(label)}
            href={v ? `/admin/partners?show=${v}` : "/admin/partners"}
            aria-current={show === v ? "page" : undefined}
            className={`chip px-3 py-1 ${show === v ? "border-lime/60 text-lime" : v === "stuck" && stuck ? "border-[#ffb648]/60 text-[#ffb648]" : "border-line text-mute hover:text-bone"}`}
          >
            {label}
          </Link>
        ))}
      </nav>

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.email} className={`rounded-md border p-4 ${r.flag ? "border-[#ffb648]/50" : "border-line"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0">
                <span className="font-medium">{r.name ?? r.email}</span>{" "}
                {r.userId ? (
                  <Link href={`/admin/accounts/${r.userId}`} className="text-mute underline-offset-4 hover:text-bone hover:underline">
                    @{r.handle}
                  </Link>
                ) : (
                  <span className="text-mute">{r.email}</span>
                )}
                {r.plan && <span className="chip ml-2 border-line text-mute">{r.plan}</span>}
              </p>
              <span className={`chip ${r.stage === "Reviewing" ? "border-lime/50 text-lime" : "border-line text-mute"}`}>{r.stage}</span>
            </div>
            {r.flag && <p className="mt-2 text-sm font-medium text-[#ffb648]">{r.flag}</p>}
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4 lg:grid-cols-8">
              {[
                ["Invited", ago(r.invitedAt, now)],
                ["Joined", ago(r.joinedAt, now)],
                ["Email confirmed", r.userId ? (r.confirmedAt ? "Yes" : "No") : "—"],
                ["First track", ago(r.firstTrackAt, now)],
                ["Tracks", r.userId ? String(r.tracks) : "—"],
                ["Reviewed", r.userId ? String(r.reviewed) : "—"],
                ["Last active", ago(r.lastActiveAt, now)],
                ["Feedback", r.feedback ? String(r.feedback) : "—"],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-xs text-faint">{k}</dt>
                  <dd className="tnum">
                    {k === "Feedback" && r.feedback ? (
                      <Link href={`/admin/feedback?user=${r.userId}`} className="underline underline-offset-4 hover:text-bone">
                        {v}
                      </Link>
                    ) : (
                      v
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <details className="mt-3" open={!!r.note}>
              <summary className="cursor-pointer text-sm text-mute hover:text-bone">{r.note ? "Call notes" : "Add call notes"}</summary>
              <form action={savePartnerNote.bind(null, r.email)} className="mt-2 space-y-2">
                <label htmlFor={`note-${r.email}`} className="sr-only">
                  Notes about {r.name ?? r.email}
                </label>
                <textarea id={`note-${r.email}`} name="note" defaultValue={r.note} rows={3} maxLength={4000} className="input resize-y" placeholder="What they said on the call, what to follow up…" />
                <button className="btn-ghost btn-sm">Save notes</button>
              </form>
            </details>
          </li>
        ))}
        {!rows.length && <li className="rounded-md border border-line px-4 py-6 text-mute">{show === "stuck" ? "Nobody needs a nudge right now." : "Nobody here yet."}</li>}
      </ul>
    </div>
  );
}
