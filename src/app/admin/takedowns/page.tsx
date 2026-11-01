import { requireAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { decideTakedown, openTakedown } from "../actions";
import { ConfirmSubmit } from "../AdminUi";
import { Avatar, PageHead, Stepper } from "../PinParts";

type Case = {
  id: number; track_id: number | null; track_label: string; claimant: string; claimant_email: string; basis: string;
  status: "open" | "removed" | "rejected"; notes: string; created_at: number; decided_at: number | null; admin: string | null;
};

const STEPS = ["Claim logged", "Track found", "Decided"];
/** Closed cases shown before the rest fold away. */
const SHOWN = 5;

const day = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

/**
 * Copyright claims, each laid out like pin 89's tracker (owner, 1 Nov): a card with the case, a three-step bar
 * (logged, track found, decided), what it's waiting for and "2 of 3". Log a claim, then remove the track or reject
 * the claim. Every step is kept for the record.
 */
export default async function Takedowns() {
  await requireAdmin("super");
  const rows = await q.all<Case>(
    "SELECT c.*, u.handle AS admin FROM takedowns c LEFT JOIN users u ON u.id = c.admin_id ORDER BY (c.status = 'open') DESC, c.created_at DESC LIMIT 200",
  );
  const open = rows.filter((r) => r.status === "open");
  const closed = rows.filter((r) => r.status !== "open");
  const closedCard = (c: Case) => (
    <li key={c.id} className="admin-panel p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="min-w-0 text-[14.5px] font-semibold">
          #{c.id} · {c.track_label}
        </p>
        <span className="text-[12.5px] text-faint">{c.decided_at ? day(c.decided_at) : ""}</span>
      </div>
      <p className="mt-0.5 text-[12.5px] text-mute">
        {c.claimant}
        {c.admin && ` · decided by @${c.admin}`}
      </p>
      <div className="mt-4">
        <Stepper steps={STEPS} done={3} status={c.status === "removed" ? "Track removed" : "Claim rejected, track stays up"} failed={c.status === "rejected"} />
      </div>
      {c.notes && <p className="mt-3 rounded-[12px] bg-ink-3 px-3 py-2 text-[13px] text-mute">{c.notes}</p>}
    </li>
  );

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Safety" title="Takedowns">
        Log a copyright claim, then decide it. Removing deletes the track and its file from the receiver&apos;s desk.
      </PageHead>

      <details className="admin-panel admin-rise group" style={{ "--i": 1 } as React.CSSProperties} open={!open.length && !closed.length}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <span aria-hidden className="grid size-7 place-items-center rounded-full bg-lime text-[16px] leading-none text-ink">
              +
            </span>
            Log a claim
          </span>
          <span aria-hidden className="text-faint transition-transform duration-200 group-open:rotate-180">
            ▾
          </span>
        </summary>
        <form action={openTakedown} className="grid gap-3 border-t border-line p-5 sm:grid-cols-2">
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
          <button className="admin-press inline-flex min-h-11 w-fit items-center rounded-full bg-lime px-5 text-[13.5px] font-semibold text-ink">Open case</button>
        </form>
      </details>

      <section aria-labelledby="open-h" className="space-y-3">
        <h2 id="open-h" className="flex items-center gap-2 text-[15px] font-semibold">
          Open
          <span className="rounded-full bg-ink-4 px-2 text-[11.5px] font-semibold text-mute tnum">{open.length}</span>
        </h2>
        {!open.length && <p className="admin-panel p-6 text-[14px] text-mute">Nothing waiting.</p>}
        <ul className="grid items-start gap-6 lg:grid-cols-2">
          {open.map((c, i) => (
            <li key={c.id} className="admin-panel admin-rise p-5" style={{ "--i": i + 2 } as React.CSSProperties}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold leading-snug">
                    #{c.id} · {c.track_label}
                  </p>
                  <p className="mt-0.5 text-[12.5px] text-faint">Logged {day(c.created_at)}</p>
                </div>
                <Avatar name={c.claimant} size={36} />
              </div>
              <div className="mt-5">
                <Stepper steps={STEPS} done={c.track_id ? 2 : 1} status={c.track_id ? "Waiting for your decision…" : "Track not found: reject, or log it again"} />
              </div>
              <div className="mt-4 rounded-[14px] bg-ink-3 px-4 py-3 text-[13.5px]">
                <p>
                  <b className="font-semibold">{c.claimant}</b> <span className="text-mute">{c.claimant_email}</span>
                </p>
                {c.basis && <p className="mt-1 whitespace-pre-wrap text-mute">{c.basis}</p>}
              </div>
              <form className="mt-4 space-y-3">
                <label className="block">
                  <span className="sr-only">Note for the record</span>
                  <input name="notes" required className="input min-h-11 w-full" placeholder="Note for the record (required)" maxLength={1000} />
                </label>
                <div className="flex flex-wrap gap-2">
                  {c.track_id && (
                    <ConfirmSubmit
                      formAction={decideTakedown.bind(null, c.id, "removed")}
                      message="Remove this track from the receiver's desk and delete the file? This can't be undone."
                      className="admin-press inline-flex min-h-11 items-center rounded-full bg-danger px-5 text-[13.5px] font-semibold text-ink"
                    >
                      Remove track
                    </ConfirmSubmit>
                  )}
                  <ConfirmSubmit
                    formAction={decideTakedown.bind(null, c.id, "rejected")}
                    message="Reject this claim and close the case? The track stays up."
                    className="admin-press inline-flex min-h-11 items-center rounded-full px-5 text-[13.5px] font-semibold ring-1 ring-line-2 hover:bg-ink-3"
                  >
                    Reject claim
                  </ConfirmSubmit>
                </div>
              </form>
            </li>
          ))}
        </ul>
      </section>

      {closed.length > 0 && (
        <section aria-labelledby="closed-h" className="space-y-3">
          <h2 id="closed-h" className="flex items-center gap-2 text-[15px] font-semibold">
            Closed
            <span className="rounded-full bg-ink-4 px-2 text-[11.5px] font-semibold text-mute tnum">{closed.length}</span>
          </h2>
          <ul className="grid items-start gap-6 lg:grid-cols-2">{closed.slice(0, SHOWN).map(closedCard)}</ul>
          {closed.length > SHOWN && (
            <details className="group">
              <summary className="flex min-h-11 cursor-pointer list-none items-center text-[13px] text-mute hover:text-bone [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">Show {closed.length - SHOWN} older cases</span>
                <span className="hidden group-open:inline">Show fewer</span>
              </summary>
              <ul className="mt-3 grid items-start gap-6 lg:grid-cols-2">{closed.slice(SHOWN).map(closedCard)}</ul>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
