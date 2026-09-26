import Link from "next/link";
import { requireUser } from "@/lib/auth";
import {q, type EventRow } from "@/lib/db";
import { History } from "../History";

export const metadata = { title: "Activity — FloorTest" };

const FILTERS = [
  ["all", "Everything", null],
  ["decisions", "Decisions", ["kept", "passed"]],
  ["signals", "Signals to senders", ["played", "downloaded", "reply"]],
  ["intake", "Intake", ["submitted", "deleted", "expired", "blocked", "unblocked"]],
] as const;

export default async function Activity({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const user = await requireUser();
  const f = (await searchParams).f;
  const filter = FILTERS.find(([k]) => k === f) ?? FILTERS[0];
  const types = filter[2];
  const events = (await q.all<EventRow & { track_title: string | null; sender_name: string }>(`SELECT e.*, t.title AS track_title, s.name AS sender_name FROM events e
       LEFT JOIN tracks t ON t.id = e.track_id JOIN senders s ON s.id = e.sender_id
       WHERE e.user_id = ? ${types ? `AND e.type IN (${types.map(() => "?").join(",")})` : "AND e.type != 'note'"}
       ORDER BY e.created_at DESC LIMIT 200`, user.id, ...(types ?? [])));

  return (
    <div className="max-w-3xl px-4 py-6 sm:px-8">
      <h1 className="text-3xl font-bold tracking-tight">Activity</h1>
      <p className="mt-2 text-mute">Everything that happened on your desk, newest first.</p>
      <nav className="mt-6 flex flex-wrap gap-1 border-b border-line" aria-label="Filter">
        {FILTERS.map(([k, label]) => (
          <Link
            key={k}
            href={k === "all" ? "/dashboard/activity" : `/dashboard/activity?f=${k}`}
            aria-current={filter[0] === k ? "page" : undefined}
            className={`-mb-px border-b-2 px-3 py-2.5 text-sm font-medium ${filter[0] === k ? "border-lime" : "border-transparent text-mute hover:text-bone"}`}
          >
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-6">
        <History events={events} showSender />
      </div>
    </div>
  );
}
