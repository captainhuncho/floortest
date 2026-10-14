"use client";

import { useRouter } from "next/navigation";
import { VIEW_COOKIE } from "./view-cookie";

/** Remembers the chosen layout for next time (a year). */
function rememberView(v: "queue" | "list") {
  document.cookie = `${VIEW_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
}

/** Switches the Queue between one-by-one review and the dense List; the choice is remembered. */
export function ViewToggle({ view }: { view: "queue" | "list" }) {
  const router = useRouter();
  const go = (v: "queue" | "list") => {
    rememberView(v);
    router.push(`/dashboard/review?view=${v}`);
  };
  return (
    <div className="flex rounded-lg border border-line p-0.5" role="group" aria-label="Layout">
      {(["queue", "list"] as const).map((v) => (
        <button
          key={v}
          onClick={() => go(v)}
          aria-pressed={view === v}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${view === v ? "bg-bone text-ink" : "text-mute hover:text-bone"}`}
        >
          {v === "queue" ? "One by one" : "List"}
        </button>
      ))}
    </div>
  );
}
