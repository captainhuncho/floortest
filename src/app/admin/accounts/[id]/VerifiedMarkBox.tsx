import Link from "next/link";
import { CuePoint } from "@/components/CuePoint";
import { can, type OpsAccess } from "@/lib/admin";
import { powersOf, proposalsFor } from "@/lib/verification-proposals";
import { ConfirmSubmit } from "../../AdminUi";
import { OpsForm } from "../../OpsForm";
import { ProofForm } from "../../ProofForm";
import { PROPOSAL_STATE, ProposalBody } from "../../ProposalParts";
import { StatusPill, type Tone } from "../../PinParts";
import { proposeVerification, revokeIdentity, verifyDirectly, withdrawProposal } from "../../actions";

const day = (t: number) => new Date(Number(t)).toLocaleDateString("en-GB");
const MARK: Record<string, [string, Tone]> = {
  verified: ["Verified", "lime"],
  pending: ["Request waiting", "amber"],
  rejected: ["Not verified (sent back or removed)", "mute"],
  none: ["Not verified", "mute"],
};

type Account = { id: number; handle: string; identity_status: string | null; identity_verified_at: number | null; identity_note: string; suspended_at: number | null; email_verified_at: number | null };

/**
 * The account page's Verified mark box (owner, 1 Nov): the state, what this person may do about it (verify directly,
 * propose, withdraw their own proposal, remove the mark), and under a fold every proposal with its reason, proof and
 * decision, so any team can see why an account has the mark. The server checks each action again.
 */
export async function VerifiedMarkBox({ me, u }: { me: { id: number; access: OpsAccess }; u: Account }) {
  const powers = powersOf(me.access);
  // Read only for people with Verification: nobody else is shown any reason, proof or decision.
  const history = powers.propose ? await proposalsFor(u.id) : [];
  const waiting = history.find((p) => p.status === "pending");
  const [label, tone] = MARK[u.identity_status ?? "none"] ?? MARK.none;
  const canAdd = u.identity_status !== "verified" && !waiting;
  const blocked = u.suspended_at ? "Restore the account before verifying it." : !u.email_verified_at ? "They need to confirm their email before they can be verified." : null;

  return (
    <section className="space-y-3 rounded-md border border-line p-4" aria-labelledby="mark-h">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="mark-h" className="flex items-center gap-1.5 text-sm font-semibold">
          <CuePoint size={16} />
          Verified mark
        </h3>
        <StatusPill tone={tone}>{label}</StatusPill>
      </div>
      {u.identity_status === "verified" && u.identity_verified_at && <p className="text-xs text-mute">Since {day(u.identity_verified_at)}</p>}
      {/* Reasons, notes and proof only for people with Verification; Users (view) alone sees the state and the date. */}
      {powers.propose && u.identity_status === "verified" && history[0]?.status === "approved" && (
        <p className="break-words text-xs text-mute">Why: {history[0].reason}</p>
      )}
      {powers.propose && u.identity_status === "rejected" && u.identity_note && <p className="break-words text-xs text-mute">Last note: {u.identity_note}</p>}
      {u.identity_status === "pending" && powers.propose && (
        <Link href="/admin/verification" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
          Review their request in Verification
        </Link>
      )}

      {waiting && (
        <div className="space-y-2 rounded-[12px] bg-ink-3/60 p-3">
          <p className="text-xs font-semibold text-[var(--admin-amber)]">{PROPOSAL_STATE.pending[0]}</p>
          {powers.propose && <ProposalBody p={waiting} decision={false} />}
          <div className="flex flex-wrap gap-2">
            {powers.approve && waiting.proposer_id !== me.id && (
              <Link href="/admin/verification#proposals-h" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
                Approve or decline in Verification
              </Link>
            )}
            {waiting.proposer_id === me.id && (
              <OpsForm action={withdrawProposal.bind(null, waiting.id)}>
                <button className="inline-flex min-h-11 items-center rounded-full px-4 text-sm ring-1 ring-line-2 hover:bg-ink-3">Withdraw my proposal</button>
              </OpsForm>
            )}
          </div>
        </div>
      )}

      {powers.propose && u.identity_status === "verified" && (
        <details>
          <summary className="cursor-pointer py-3 text-sm">Remove verification…</summary>
          <OpsForm action={revokeIdentity.bind(null, u.id)} className="mt-2 space-y-2">
            <label className="block space-y-1.5">
              <span className="label">Reason (sent to them)</span>
              <input name="note" required maxLength={200} className="input text-base sm:text-sm" placeholder="e.g. the account changed hands" />
            </label>
            <ConfirmSubmit
              message={`Remove @${u.handle}'s Verified mark? They'll be emailed the reason.`}
              className="btn-sm w-full rounded-md border border-danger/50 px-4 text-danger hover:bg-danger/10"
            >
              Remove verification
            </ConfirmSubmit>
          </OpsForm>
        </details>
      )}

      {powers.propose && canAdd && (blocked ? (
        <p className="text-xs text-mute">{blocked}</p>
      ) : powers.direct ? (
        <details>
          <summary className="cursor-pointer py-3 text-sm">Verify profile…</summary>
          <ProofForm
            action={verifyDirectly.bind(null, u.id)}
            submitLabel="Verify and email them"
            confirm={`Add the Verified mark to @${u.handle} and email them?`}
            hint="Adds the mark now. The reason and proof are kept on this account for other teams; the email doesn't include them."
          />
        </details>
      ) : (
        <details>
          <summary className="cursor-pointer py-3 text-sm">Propose verification…</summary>
          <ProofForm
            action={proposeVerification.bind(null, u.id)}
            submitLabel="Send for approval"
            hint="Someone who approves verifications checks your reason and proof, then adds the mark. You can withdraw it while it waits."
          />
        </details>
      ))}

      {can(me.access, "verification") && history.length > 0 && (
        <details className="border-t border-line pt-1">
          <summary className="cursor-pointer py-3 text-sm">History ({history.length})</summary>
          <ol className="space-y-4">
            {history.map((p) => (
              <li key={p.id} className="space-y-2 border-t border-line pt-3 first:border-t-0 first:pt-0">
                <StatusPill tone={PROPOSAL_STATE[p.status][1]}>{PROPOSAL_STATE[p.status][0]}</StatusPill>
                <ProposalBody p={p} />
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
