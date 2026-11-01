import { can, requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { q } from "@/lib/db";
import { ago } from "@/lib/format";
import { setFeedbackStatus } from "../actions";
import { Avatar, LevelPill, PageHead, type Tone } from "../PinParts";

export const metadata = { title: "Feedback — FloorTest admin" };

const STATUSES = [
  ["new", "New"],
  ["planned", "Planned"],
  ["fixed", "Fixed"],
  ["wontdo", "Won't do"],
] as const;
const STATUS_TONE: Record<string, Tone> = { new: "amber", planned: "violet", fixed: "lime", wontdo: "mute" };
const STATUS_BAR: Record<string, string> = { new: "bg-[var(--admin-amber)]", planned: "bg-[var(--admin-violet)]", fixed: "bg-lime", wontdo: "bg-faint" };
const TYPES = ["Idea", "Bug", "Confusing", "Love it"] as const;
const TYPE_TONE: Record<string, Tone> = { Idea: "violet", Bug: "danger", Confusing: "amber", "Love it": "lime" };
/** When the picked view is empty, this many of the latest items (any status) show underneath, so the page still says something. */
const LATEST = 3;

type Row = { id: number; user_id: number | null; handle: string | null; name: string; topic: string; message: string; page: string; feedback_status: string; created_at: number };
const COLS = "m.id, m.user_id, u.handle, m.name, m.topic, m.message, m.page, m.feedback_status, m.created_at";
const FROM = "FROM contact_messages m LEFT JOIN users u ON u.id = m.user_id";

/**
 * In-app feedback from beta users, rebuilt from the owner's pins (1 Nov): the four statuses as big counts you click to
 * filter (pin 96's stat cards), the types as one switch, then each item with who sent it, a type label and a status
 * switch. An empty view isn't a dead end: it says when the last one came in and shows the latest few underneath.
 */
export default async function Feedback({ searchParams }: { searchParams: Promise<{ status?: string; type?: string; user?: string }> }) {
  const me = await requireAdmin("feedback.read");
  const canAct = can(me.access, "feedback.act");
  const sp = await searchParams;
  const status = STATUSES.some(([k]) => k === sp.status) ? sp.status! : sp.status === "all" ? "all" : "new";
  const type = (TYPES as readonly string[]).includes(sp.type ?? "") ? sp.type! : null;
  const user = Number(sp.user) || null;

  const where = ["m.topic LIKE 'Feedback%'"];
  const args: (string | number)[] = [];
  if (status !== "all") {
    where.push("m.feedback_status = ?");
    args.push(status);
  }
  if (type) {
    where.push("m.topic = ?");
    args.push(`Feedback · ${type}`);
  }
  if (user) {
    where.push("m.user_id = ?");
    args.push(user);
  }
  const [rows, counts] = await Promise.all([
    q.all<Row>(`SELECT ${COLS} ${FROM} WHERE ${where.join(" AND ")} ORDER BY m.created_at DESC LIMIT 300`, ...args),
    q.all<{ topic: string; feedback_status: string; n: number; last: number }>(
      "SELECT topic, feedback_status, COUNT(*)::int AS n, MAX(created_at) AS last FROM contact_messages WHERE topic LIKE 'Feedback%' GROUP BY topic, feedback_status",
    ),
  ]);
  const latest = rows.length ? [] : await q.all<Row>(`SELECT ${COLS} ${FROM} WHERE m.topic LIKE 'Feedback%' ORDER BY m.created_at DESC LIMIT ${LATEST}`);
  const total = counts.reduce((a, c) => a + c.n, 0);
  const lastAt = counts.reduce((a, c) => Math.max(a, Number(c.last)), 0);
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
  const label = STATUSES.find(([k]) => k === status)?.[1] ?? "All";
  const pill = "admin-press inline-flex min-h-11 items-center rounded-full px-4 text-[13px] font-semibold text-mute ring-1 ring-line-2 hover:text-bone";

  return (
    <div className="space-y-6">
      <PageHead
        eyebrow="Beta"
        title="Feedback"
        aside={
          <span className="text-[13px] text-mute">
            {total ? (
              <>
                Last one <span className="text-bone">{ago(lastAt)}</span> · {total} in all
              </>
            ) : (
              "Nothing sent yet"
            )}
          </span>
        }
      >
        What beta users send from the Feedback button inside the app. Support messages from the Contact form stay in the Inbox.
      </PageHead>

      {/* The four statuses as pin 96's stat cards; each one is the filter for its status. */}
      <nav aria-label="Status" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {STATUSES.map(([k, l], i) => {
          const n = byStatus(k);
          const share = total ? (n / total) * 100 : 0;
          return (
            <Link
              key={k}
              href={href({ status: k })}
              aria-current={status === k ? "page" : undefined}
              className={`admin-panel admin-rise admin-press block p-4 sm:p-5 ${status === k ? "ring-2 ring-bone/70" : "hover:ring-1 hover:ring-line-2"}`}
              style={{ "--i": i } as React.CSSProperties}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium text-mute">{l}</span>
                {k === "new" && n > 0 && <LevelPill tone="amber">to triage</LevelPill>}
              </span>
              <span className="mt-2 block font-mono text-[30px] font-semibold leading-none tracking-[-0.02em] tnum">{n}</span>
              <span aria-hidden className="mt-4 block h-2 overflow-hidden rounded-full bg-ink-4">
                <span className={`admin-grow block h-full rounded-full ${STATUS_BAR[k]}`} style={{ width: `${Math.max(share, n ? 3 : 0)}%`, "--i": i } as React.CSSProperties} />
              </span>
              <span className="mt-2.5 block font-mono text-[11.5px] text-faint">{total ? `${Math.round(share)}% of ${total}` : "none yet"}</span>
            </Link>
          );
        })}
      </nav>

      <section aria-label={`${label} feedback`} className="admin-panel admin-rise p-4 sm:p-5" style={{ "--i": 4 } as React.CSSProperties}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Type" className="inline-flex max-w-full flex-wrap rounded-[22px] bg-ink-3 p-1 ring-1 ring-line">
            {[null, ...TYPES].map((t) => {
              const on = type === t;
              return (
                <Link
                  key={t ?? "every"}
                  href={href({ type: t })}
                  aria-current={on ? "page" : undefined}
                  className={`admin-press flex min-h-11 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold ${on ? "bg-bone text-ink" : "text-mute hover:text-bone"}`}
                >
                  {t ?? "Every type"}
                  <span className={`rounded-full px-1.5 text-[11px] tnum ${on ? "bg-ink/10" : "bg-ink-4"}`}>{t ? byType(t) : total}</span>
                </Link>
              );
            })}
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            {status !== "all" && total > 0 && (
              <Link href={href({ status: "all" })} className={pill}>
                Show all {total}
              </Link>
            )}
            {user && (
              <Link href={href({ user: null })} className={pill}>
                One person only ✕
              </Link>
            )}
          </div>
        </div>

        {topPages.length > 1 && (
          <p className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-mute">
            Most mentioned pages
            {topPages.map(([p, n]) => (
              <span key={p} className="rounded-[6px] bg-ink-3 px-2 py-1 font-mono text-[12px] text-bone ring-1 ring-line">
                {p} <span className="text-faint">{n}</span>
              </span>
            ))}
          </p>
        )}

        {rows.length > 0 ? (
          <ul className="mt-4 overflow-hidden rounded-[16px] ring-1 ring-line">
            {rows.map((r, i) => (
              <Item key={r.id} r={r} i={i} canAct={canAct} />
            ))}
          </ul>
        ) : (
          <div className="mt-4 rounded-[16px] px-4 py-8 text-center ring-1 ring-line">
            <span aria-hidden className="mx-auto grid size-12 place-items-center rounded-full bg-lime/12 text-[20px] font-bold text-lime ring-1 ring-lime/35">
              ✓
            </span>
            <p className="mt-3 text-[17px] font-semibold">{status === "new" ? "All caught up" : `Nothing ${status === "all" ? "here" : `marked ${label.toLowerCase()}`}${type ? ` for ${type}` : ""}`}</p>
            <p className="mt-1 text-[13.5px] text-mute">
              {status === "new" && total ? "Every piece of feedback has a status. " : ""}
              {total ? `The last one came in ${ago(lastAt)}.` : "Nobody has sent feedback yet."}
            </p>
          </div>
        )}

        {latest.length > 0 && (
          <div className="mt-6">
            <h2 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-faint">Latest</h2>
            <ul className="mt-3 overflow-hidden rounded-[16px] ring-1 ring-line">
              {latest.map((r, i) => (
                <Item key={r.id} r={r} i={i} canAct={canAct} />
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

/** One piece of feedback: who sent it and when, its type, the message, the page it was sent from, and its status switch. */
function Item({ r, i, canAct }: { r: Row; i: number; canAct: boolean }) {
  const kind = r.topic.replace("Feedback · ", "");
  const current = STATUSES.find(([k]) => k === r.feedback_status)?.[1] ?? r.feedback_status;
  return (
    <li className="admin-rise border-t border-line px-4 py-4 first:border-t-0" style={{ "--i": Math.min(i, 12) } as React.CSSProperties}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Avatar name={r.name || r.handle || "?"} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">
            {r.name}{" "}
            {r.user_id && r.handle && (
              <Link href={`/admin/accounts/${r.user_id}`} className="font-normal text-mute underline-offset-4 hover:text-bone hover:underline">
                @{r.handle}
              </Link>
            )}
          </span>
          <span className="block truncate text-[12px] text-faint">
            {ago(r.created_at)}
            {r.page && (
              <>
                {" · on "}
                <span className="font-mono text-mute">{r.page}</span>
              </>
            )}
          </span>
        </span>
        <LevelPill tone={TYPE_TONE[kind] ?? "mute"}>{kind}</LevelPill>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-[14.5px] leading-relaxed sm:pl-11">{r.message}</p>
      <div className="mt-3 sm:pl-11">
        {canAct ? (
          <div role="group" aria-label="Status" className="inline-flex max-w-full flex-wrap rounded-[22px] bg-ink-3 p-1 ring-1 ring-line">
            {STATUSES.map(([k, l]) => {
              const on = r.feedback_status === k;
              return (
                <form key={k} action={setFeedbackStatus.bind(null, r.id, k)}>
                  <button aria-pressed={on} className={`admin-press inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-semibold ${on ? "bg-bone text-ink" : "text-mute hover:text-bone"}`}>
                    {on && <span aria-hidden>✓</span>}
                    {l}
                  </button>
                </form>
              );
            })}
          </div>
        ) : (
          <LevelPill tone={STATUS_TONE[r.feedback_status] ?? "mute"}>{current}</LevelPill>
        )}
      </div>
    </li>
  );
}
