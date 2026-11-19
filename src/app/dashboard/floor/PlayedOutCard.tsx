"use client";

import Link from "next/link";
import { useTransition } from "react";
import { skipPlayedOutPrompt } from "../actions/review";
import { LABEL, QUIET } from "./Crates";

/**
 * Monday and Tuesday on DJ desks: one question about last week's kept tracks. Answering closes it for the week.
 * "Mark what I played" is lime; on phones it is the Floor's only lime button (option 41, 16 Nov). `readOnly` (an admin's View as) leaves out
 * "None this weekend", which would answer for the desk.
 */
export function PlayedOutCard({ titles, readOnly = false }: { titles: string[]; readOnly?: boolean }) {
  const [pending, start] = useTransition();
  const n = titles.length;
  return (
    <section aria-labelledby="po-h" className="flex flex-col gap-2.5 rounded-[20px] border border-line bg-card p-4">
      <p className={LABEL}>After the weekend</p>
      <h2 id="po-h" className="text-[19px] font-bold leading-tight tracking-[-0.3px] text-bone">Did any of these get played?</h2>
      <p className="text-[13px] leading-snug text-mute">
        {n} track{n === 1 ? "" : "s"} you kept last week
        {n <= 3 ? `: ${titles.join(", ")}` : `, starting with ${titles.slice(0, 2).join(", ")}`}. Tick the ones you played and each sender sees Played out.
      </p>
      <div className="mt-1 flex flex-wrap gap-2">
        <Link href="/dashboard/played-out" className="btn-lime min-h-11 rounded-[14px] px-5! text-[14px]! font-semibold">
          Mark what I played
        </Link>
        {!readOnly && (
          <button type="button" className={QUIET} disabled={pending} onClick={() => start(() => skipPlayedOutPrompt())}>
            {pending ? "Closing…" : "None this weekend"}
          </button>
        )}
      </div>
    </section>
  );
}
