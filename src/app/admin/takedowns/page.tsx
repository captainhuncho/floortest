import { q } from "@/lib/db";
import { decideTakedown, openTakedown } from "../actions";

type Case = {
  id: number; track_id: number | null; track_label: string; claimant: string; claimant_email: string; basis: string;
  status: "open" | "removed" | "rejected"; notes: string; created_at: number; decided_at: number | null; admin: string | null;
};

const day = (t: number) => new Date(t).toLocaleDateString("en-GB");

/** Copyright claims: log each one, then remove the track or reject the claim. Every step is kept for the record. */
export default async function Takedowns() {
  const rows = await q.all<Case>(
    "SELECT c.*, u.handle AS admin FROM takedowns c LEFT JOIN users u ON u.id = c.admin_id ORDER BY (c.status = 'open') DESC, c.created_at DESC LIMIT 200",
  );
  const open = rows.filter((r) => r.status === "open");
  const closed = rows.filter((r) => r.status !== "open");
  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Takedowns</h1>
        <p className="mt-2 text-mute">Log a copyright claim, then decide it. Removing deletes the track and its file from the receiver&apos;s desk.</p>
      </div>

      <form action={openTakedown} className="grid gap-3 rounded-md border border-line p-5 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="label">Claimant</span>
          <input name="claimant" required className="input" placeholder="Name or label" maxLength={120} />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Claimant email</span>
          <input name="claimant_email" type="email" required className="input" placeholder="legal@label.com" />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="label">Track (receipt token or track id, from Moderation)</span>
          <input name="track" required className="input" />
        </label>
        <label className="block space-y-1.5 sm:col-span-2">
          <span className="label">What they claim</span>
          <textarea name="basis" rows={3} className="input resize-y" placeholder="The work they own, and how this track infringes it" />
        </label>
        <button className="btn-lime btn-sm w-fit">Open case</button>
      </form>

      <section aria-labelledby="open-h" className="space-y-3">
        <h2 id="open-h" className="text-lg font-semibold">Open ({open.length})</h2>
        {!open.length && <p className="text-mute">Nothing waiting.</p>}
        {open.map((c) => (
          <div key={c.id} className="space-y-3 rounded-md border border-line p-5">
            <div className="flex flex-wrap justify-between gap-2">
              <p className="font-bold">#{c.id} · {c.track_label}</p>
              <p className="text-sm text-mute">{day(c.created_at)}</p>
            </div>
            <p className="text-sm">{c.claimant} <span className="text-mute">{c.claimant_email}</span></p>
            {c.basis && <p className="whitespace-pre-wrap text-sm text-mute">{c.basis}</p>}
            <form className="flex flex-wrap items-end gap-2">
              <input name="notes" className="input min-w-0 flex-1" placeholder="Note for the record" maxLength={1000} />
              {c.track_id && (
                <button formAction={decideTakedown.bind(null, c.id, "removed")} className="btn-sm rounded-md bg-danger px-3 py-2 font-bold text-ink">
                  Remove track
                </button>
              )}
              <button formAction={decideTakedown.bind(null, c.id, "rejected")} className="btn-ghost btn-sm">
                Reject claim
              </button>
            </form>
          </div>
        ))}
      </section>

      {closed.length > 0 && (
        <section aria-labelledby="closed-h" className="space-y-3">
          <h2 id="closed-h" className="text-lg font-semibold">Closed</h2>
          <div className="overflow-x-auto rounded-md border border-line">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line text-mute">
                <tr>{["Case", "Claimant", "Outcome", "Note", "Decided"].map((h) => <th key={h} className="px-4 py-2.5 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-line">
                {closed.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3">#{c.id} · {c.track_label}</td>
                    <td className="px-4 py-3 text-mute">{c.claimant}</td>
                    <td className="px-4 py-3">{c.status === "removed" ? "Track removed" : "Rejected"}{c.admin && <span className="text-mute"> · @{c.admin}</span>}</td>
                    <td className="px-4 py-3 text-mute">{c.notes || "—"}</td>
                    <td className="px-4 py-3 text-mute">{c.decided_at ? day(c.decided_at) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
