"use client";

import Link from "next/link";
import { useTransition } from "react";
import { skipPlayedOutPrompt } from "../actions/review";

/** Monday and Tuesday on DJ desks: one question about last week's kept tracks. Answering closes it for the week. */
export function PlayedOutCard({ titles }: { titles: string[] }) {
  const [pending, start] = useTransition();
  const n = titles.length;
  return (
    <section aria-labelledby="po-h" className="flex flex-col gap-3.5 rounded-2xl border border-line-2 bg-ink-2 p-5">
      <p className="text-[11.5px] text-mute">After the weekend</p>
      <h2 id="po-h" className="text-[22px] font-bold leading-tight tracking-[-0.4px] text-bone">Did any of these get played?</h2>
      <p className="text-[13px] text-mute">
        {n} track{n === 1 ? "" : "s"} you kept last week
        {n <= 3 ? `: ${titles.join(", ")}` : `, starting with ${titles.slice(0, 2).join(", ")}`}. Tick the ones you played and each sender sees Played out.
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/dashboard/played-out" className="btn border border-bone bg-bone text-ink hover:bg-white">
          Mark what I played
        </Link>
        <button className="btn-ghost" disabled={pending} onClick={() => start(() => skipPlayedOutPrompt())}>
          {pending ? "Closing…" : "None this weekend"}
        </button>
      </div>
    </section>
  );
}
