"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { dismissNotice } from "./actions/desk";

/**
 * Ops → Notices on the signed-in dashboard: one thin line under the top bar while a notice is live ("Short update
 * Sun 15 Nov, 02:00–02:20. Uploads pause for a few minutes."). Everything is printed as text. Closing is saved on the
 * server for the person (lib/site-notices), so a closed notice is never rendered again, on any device; a new one shows.
 */
export function NoticeStrip({ id, title, detail, href, when }: { id: number; title: string; detail: string; href: string; when: string }) {
  const [closed, setClosed] = useState(false);
  const [, start] = useTransition();
  if (closed) return null;
  return (
    <div role="status" className="flex items-center gap-2 border-b border-line bg-ink-2 py-1 pl-4 pr-1.5 text-[13.5px] leading-snug sm:pl-6">
      <p className="min-w-0 flex-1 py-2">
        <span className="font-semibold">{title}</span> {when}.{detail && <span className="text-mute"> {detail}</span>}
        {href && (
          <>
            {" "}
            <Link href={href} className="font-medium underline underline-offset-4">
              More
            </Link>
          </>
        )}
      </p>
      <button
        type="button"
        aria-label="Close this notice"
        className="grid size-11 shrink-0 place-items-center rounded-full text-mute hover:bg-ink-3 hover:text-bone motion-safe:transition-colors"
        onClick={() => {
          // Hides at once; if the server couldn't save it, it comes back so the person can try again.
          setClosed(true);
          start(async () => {
            const saved = await dismissNotice(id).catch(() => false);
            if (!saved) setClosed(false);
          });
        }}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}
