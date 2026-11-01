import type { ProposalRow } from "@/lib/verification-proposals";
import type { Tone } from "./PinParts";

const day = (t: number) => new Date(Number(t)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const proofUrl = (id: number) => `/api/admin/verification-proofs/${id}`;

export const PROPOSAL_STATE: Record<ProposalRow["status"], [string, Tone]> = {
  pending: ["Waiting for approval", "amber"],
  approved: ["Approved", "lime"],
  declined: ["Declined", "danger"],
  withdrawn: ["Withdrawn", "mute"],
};

/**
 * One verification proposal as other teams read it (owner, 1 Nov): who proposed it and when, the reason, the profile
 * links and the proof (image thumbnails, PDFs by name), each opening through the permission-checked proof route.
 * Everything shown is text, so names, reasons and file names are escaped by React.
 */
export function ProposalBody({ p, decision = true }: { p: ProposalRow; decision?: boolean }) {
  const links = p.links.split("\n").filter((l) => l.startsWith("https://"));
  const direct = p.status === "approved" && !!p.proposer && p.proposer === p.decider;
  return (
    <div className="space-y-2.5 text-[13.5px]">
      <p className="text-[12.5px] text-faint">
        {!p.proposer ? (p.reason.startsWith("Their own request") ? "Their own request" : "Proposed by a former staff member") : direct ? `Verified directly by @${p.proposer}` : `Proposed by @${p.proposer}`} ·{" "}
        {day(p.created_at)}
      </p>
      <p className="whitespace-pre-line break-words">{p.reason}</p>
      {links.length > 0 && (
        <ul className="space-y-0.5">
          {links.map((l) => (
            <li key={l}>
              <a href={l} target="_blank" rel="noreferrer noopener" className="inline-flex min-h-11 items-center break-all text-bone underline underline-offset-4 hover:text-lime">
                {l.replace(/^https:\/\//, "")} ↗
              </a>
            </li>
          ))}
        </ul>
      )}
      {p.proofs.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Proof">
          {p.proofs.map((f) => (
            <li key={f.id}>
              <a
                href={proofUrl(f.id)}
                target="_blank"
                rel="noopener"
                className="flex min-h-11 items-center gap-2 overflow-hidden rounded-[12px] bg-ink-3 pr-3 text-[12.5px] ring-1 ring-line hover:ring-line-2"
              >
                {f.mime.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a private, permission-checked file; not for the image optimiser
                  <img src={proofUrl(f.id)} alt="" loading="lazy" className="size-16 object-cover" />
                ) : (
                  <span aria-hidden className="grid size-16 place-items-center bg-ink-4 text-[11px] font-semibold text-mute">
                    PDF
                  </span>
                )}
                <span className="max-w-40 truncate">{f.original_name}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {decision && p.status !== "pending" && !direct && p.decided_at && (
        <p className="text-[12.5px] text-mute">
          {PROPOSAL_STATE[p.status][0]}
          {p.decider ? ` by @${p.decider}` : ""} · {day(p.decided_at)}
          {p.decision_note ? `: ${p.decision_note}` : ""}
        </p>
      )}
    </div>
  );
}
