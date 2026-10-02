import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {q, type EventRow } from "@/lib/db";
import { recentAudit } from "@/lib/audit";
import { AccountLog } from "../AccountLog";
import { History } from "../History";

export const metadata = { title: "Activity — FloorTest" };

const FILTERS = [
  ["you", "Your actions", null],
  ["all", "Desk events", null],
  ["decisions", "Decisions", ["kept", "passed"]],
  ["signals", "Signals to senders", ["played", "downloaded", "reply"]],
  ["intake", "Intake", ["submitted", "deleted", "expired", "blocked", "unblocked"]],
] as const;

export default async function Activity({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requireUser();
  const f = (await searchParams).f;
  const filter = FILTERS.find(([k]) => k === f) ?? FILTERS[0];
  const types = filter[2];
  const mine = filter[0] === "you" ? await recentAudit(user.id, 300) : [];
  const events = filter[0] === "you" ? [] : (await q.all<EventRow & { track_title: string | null; sender_name: string }>(`SELECT e.*, t.title AS track_title, s.name AS sender_name FROM events e
       LEFT JOIN tracks t ON t.id = e.track_id JOIN senders s ON s.id = e.sender_id
       WHERE e.user_id = ? ${types ? `AND e.type IN (${types.map(() => "?").join(",")})` : "AND e.type != 'note'"}
       ORDER BY e.created_at DESC LIMIT 200`, user.id, ...(types ?? [])));

  return (
    <div className="flex max-w-3xl flex-col gap-4 px-4 py-4 text-bone sm:px-8 sm:py-6">
      <div className="flex items-center gap-3 border-b border-line pb-4 md:border-0 md:pb-0">
        <Link href="/dashboard/account" aria-label="Back to Account" className="text-[18px] leading-none md:hidden">
          ‹
        </Link>
        <h1 className="text-[18px] font-bold sm:text-3xl md:text-[32px]">Activity</h1>
      </div>
      <p className="text-[12px] leading-[1.5] text-mute">
        {filter[0] === "you" ? "Everything you did in your account, newest first. Only you can see this." : "What happened on your desk, including what senders did."}
      </p>
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0 md:gap-6 md:border-b md:border-line" aria-label="Filter">
        {FILTERS.map(([k, label]) => (
          <Link
            key={k}
            href={k === "you" ? "/dashboard/activity" : `/dashboard/activity?f=${k}`}
            aria-current={filter[0] === k ? "page" : undefined}
            className={`shrink-0 rounded-full border border-line px-3 py-1.5 text-[11px] md:-mb-px md:rounded-none md:border-0 md:border-b-2 md:bg-transparent md:px-1 md:py-2.5 md:text-[12px] ${
              filter[0] === k ? "bg-white font-bold text-ink md:border-bone md:text-bone" : "bg-ink-3 font-medium text-mute md:border-transparent md:hover:text-bone"
            }`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="text-[12px] [&_li]:border-b [&_li]:border-line [&_li]:pb-3 [&_li:last-child]:border-0 [&_li_.text-sm]:text-[10px] [&_li_.text-sm]:text-faint [&_li>span:first-child]:bg-white [&_li_.font-medium]:font-bold">
        {filter[0] === "you" ? <AccountLog rows={mine} /> : <History events={events} showSender />}
      </div>
    </div>
  );
}
