"use client";

import { useState } from "react";
import { useToast } from "@/components/Toast";

/** The receiver's one link, always in reach: shown in full on wide screens, one tap to copy. */
export function LinkPill({ link }: { link: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const pretty = link.replace(/^https?:\/\//, "");

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast.show({ message: "Your link is copied. Paste it anywhere." });
    } catch {
      toast.show({ message: `Couldn't copy. Your link is ${pretty}` });
    }
  }

  return (
    <div className="mr-auto flex min-w-0 items-center rounded-full border border-line bg-ink-2 p-1">
      <button
        type="button"
        onClick={copy}
        title="Copy your link"
        className="hidden min-w-0 truncate px-3 font-mono text-sm text-mute hover:text-bone sm:block"
      >
        {pretty}
      </button>
      <button
        type="button"
        onClick={copy}
        aria-label={`Copy your link, ${pretty}`}
        className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${copied ? "bg-bone text-ink" : "bg-lime text-ink hover:brightness-95"}`}
      >
        <span className="sm:hidden">{copied ? "Copied ✓" : "Copy link"}</span>
        <span className="hidden sm:inline">{copied ? "Copied ✓" : "Copy"}</span>
      </button>
    </div>
  );
}
