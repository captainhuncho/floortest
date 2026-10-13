import Link from "next/link";
import { AUDIT_LABELS, type AuditRow } from "@/lib/audit";
import { fmtDate } from "@/lib/format";

/** What was done in the account, newest first; on a team desk each teammate's actions carry their name. */
export function AccountLog({ rows }: { rows: AuditRow[] }) {
  if (!rows.length) return <p className="text-sm text-mute">Nothing yet. What you do on your desk shows up here.</p>;
  return (
    <ol className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="flex gap-3">
          <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-lime" />
          <div className="min-w-0">
            <p className="break-words">
              <span className="font-medium">{AUDIT_LABELS[r.action] ?? r.action}</span>
              {r.detail &&
                (r.track_id ? (
                  <Link href={`/dashboard/review?view=queue&s=all&t=${r.track_id}`} className="text-mute hover:text-bone">
                    {" "}
                    {r.detail}
                  </Link>
                ) : (
                  <span className="text-mute"> {r.detail}</span>
                ))}
            </p>
            <p className="text-sm text-mute">
              {fmtDate(r.created_at)}
              {r.actor_name && <> · by {r.actor_name}</>}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
