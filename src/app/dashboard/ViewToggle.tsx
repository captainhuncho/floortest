"use client";

import { useRouter } from "next/navigation";
import { VIEW_COOKIE } from "./view-cookie";
import { SEG, segTab } from "@/components/Kit";

/** Remembers the chosen layout for next time (a year). */
function rememberView(v: "queue" | "list") {
  document.cookie = `${VIEW_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
}

/** Switches the Review Queue between the focused Queue and the dense List; the choice is remembered. */
export function ViewToggle({ view }: { view: "queue" | "list" }) {
  const router = useRouter();
  const go = (v: "queue" | "list") => {
    rememberView(v);
    router.push(`/dashboard/review?view=${v}`);
  };
  return (
    <div className={SEG} role="group" aria-label="Layout">
      {(["queue", "list"] as const).map((v) => (
        <button
          key={v}
          onClick={() => go(v)}
          aria-pressed={view === v}
          className={`${segTab(view === v)} min-h-10! px-3 transition-colors`}
        >
          {v === "queue" ? "Queue" : "List"}
        </button>
      ))}
    </div>
  );
}
