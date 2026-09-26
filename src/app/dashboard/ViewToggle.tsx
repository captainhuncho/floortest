"use client";

import { useRouter } from "next/navigation";

export const VIEW_COOKIE = "ft_submissions_view";

/** Switches the Review Queue between the focused Queue and the dense List; the choice is remembered. */
export function ViewToggle({ view }: { view: "queue" | "list" }) {
  const router = useRouter();
  const go = (v: "queue" | "list") => {
    document.cookie = `${VIEW_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
    router.push(`/dashboard?view=${v}`);
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
          {v === "queue" ? "Queue" : "List"}
        </button>
      ))}
    </div>
  );
}
