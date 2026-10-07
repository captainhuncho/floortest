import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { q } from "@/lib/db";
import { setFeedbackStatus } from "../actions";

export const metadata = { title: "Feedback — FloorTest admin" };

const STATUSES = [
  ["new", "New"],
  ["planned", "Planned"],
  ["fixed", "Fixed"],
  ["wontdo", "Won't do"],
] as const;
const TYPES = ["Idea", "Bug", "Confusing", "Love it"] as const;

type Row = { id: number; user_id: number | null; handle: string | null; name: string; topic: string; message: string; page: string; feedback_status: string; created_at: number };

/** In-app feedback from beta users: triage each item (new → planned → fixed, or won't do) and see what keeps coming up. */
export default async function Feedback({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; user?: string }> }) {
  await requireAdmin("feedback.read");
  const sp = await searchParams;
  const status = STATUSES.some(([k]) => k === sp.status) ? sp.status! : sp.status === "all" ? "all" : "new";
  const type = (TYPES as readonly string[]).includes(sp.type ?? "") ? sp.type! : null;
  const user = Number(sp.user) || null;

  const where = ["m.topic LIKE 'Feedback%'"];
  const args: (string | number)[] = [];
  if (status !== "all") (where.push("m.feedback_status = ?"), args.push(status));
  if (type) (where.push("m.topic = ?"), args.push(`Feedback · ${type}`));
  if (user) (where.push("m.user_id = ?"), args.push(user));
  const rows = await q.all<Row>(
    `SELECT m.id, m.user_id, u.handle, m.name, m.topic, m.message, m.page, m.feedback_status, m.created_at
     FROM contact_messages m LEFT JOIN users u ON u.id = m.user_id WHERE ${where.join(" AND ")} ORDER BY m.created_at DESC LIMIT 300`,
    ...args,
  );
  const counts = await q.all<{ topic: string; feedback_status: string; n: number }>(
    "SELECT topic, feedback_status, COUNT(*)::int AS n FROM contact_messages WHERE topic LIKE 'Feedback%' GROUP BY topic, feedback_status",
  );
  const byStatus = (s: string) => counts.filter((c) => c.feedback_status === s).reduce((a, c) => a + c.n, 0);
  const byType = (t: string) => counts.filter((c) => c.topic === `Feedback · ${t}`).reduce((a, c) => a + c.n, 0);
  const pages = new Map<string, number>();
  for (const r of rows) if (r.page) pages.set(r.page, (pages.get(r.page) ?? 0) + 1);
  const topPages = [...pages].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const href = (patch: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const next = { status, type, user: user ? String(user) : null, ...patch };
    for (const [k, v] of Object.entries(next)) if (v && !(k === "status" && v === "new")) p.set(k, v);
    const s = p.toString();
    return `/admin/feedback${s ? `?${s}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Feedback</h1>
        <p className="mt-2 max-w-2xl text-mute">
          What beta users send from the Feedback button inside the app. Support messages from the Contact form stay in the Inbox.
        </p>
      </div>

      <div className="space-y-3">
        <nav aria-label="Status" className="flex flex-wrap gap-2">
          {[...STATUSES, ["all", "All"] as const].map(([k, l]) => (
            <Link key={k} href={href({ status: k })} aria-current={status === k ? "page" : undefined} className={`chip px-3 py-1 ${status === k ? "border-lime/60 text-lime" : "border-line text-mute hover:text-bone"}`}>
              {l} ({k === "all" ? counts.reduce((a, c) => a + c.n, 0) : byStatus(k)})
            </Link>
          ))}
        </nav>
        <nav aria-label="Type" className="flex flex-wrap gap-2">
          <Link href={href({ type: null })} aria-current={!type ? "page" : undefined} className={`chip ${!type ? "border-bone/60 text-bone" : "border-line text-mute hover:text-bone"}`}>
            Every type
          </Link>
          {TYPES.map((t) => (
            <Link key={t} href={href({ type: t })} aria-current={type === t ? "page" : undefined} className={`chip ${type === t ? "border-bone/60 text-bone" : "border-line text-mute hover:text-bone"}`}>
              {t} ({byType(t)})
            </Link>
          ))}
          {user && (
            <Link href={href({ user: null })} className="chip border-line text-mute hover:text-bone">
              One person only ✕
            </Link>
          )}
        </nav>
      </div>

      {topPages.length > 1 && (
        <p className="text-sm text-mute">
          Most mentioned pages here:{" "}
          {topPages.map(([p, n], i) => (
            <span key={p}>
              {i > 0 && " · "}
              <span className="font-mono text-xs text-bone">{p}</span> ({n})
            </span>
          ))}
        </p>
      )}

      <ul className="space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="rounded-md border border-line p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="min-w-0">
                <span className={`chip mr-2 ${r.topic.endsWith("Bug") ? "border-danger/50 text-danger" : r.topic.endsWith("Love it") ? "border-lime/50 text-lime" : "border-line text-mute"}`}>
                  {r.topic.replace("Feedback · ", "")}
                </span>
                <span className="font-medium">{r.name}</span>{" "}
                {r.user_id && r.handle && (
                  <Link href={`/admin/accounts/${r.user_id}`} className="text-mute underline-offset-4 hover:text-bone hover:underline">
                    @{r.handle}
                  </Link>
                )}
              </p>
              <span className="text-sm text-mute">{new Date(r.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            {r.page && <p className="mt-1 font-mono text-xs text-mute">on {r.page}</p>}
            <p className="mt-3 whitespace-pre-wrap text-sm">{r.message}</p>
            <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Status">
              {STATUSES.map(([k, l]) => (
                <form key={k} action={setFeedbackStatus.bind(null, r.id, k)}>
                  <button aria-pressed={r.feedback_status === k} className={`btn-sm ${r.feedback_status === k ? "btn-lime" : "btn-ghost"}`}>
                    {l}
                  </button>
                </form>
              ))}
            </div>
          </li>
        ))}
        {!rows.length && <li className="rounded-md border border-line px-4 py-6 text-mute">{status === "new" ? "Nothing new to triage." : "Nothing here."}</li>}
      </ul>
    </div>
  );
}
