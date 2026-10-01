"use client";

import { useToast } from "@/components/Toast";

/** Figma "link-copy-box": the receiving link with a one-tap copy. */
export function CopyLinkBox({ link }: { link: string }) {
  const toast = useToast();
  const pretty = link.replace(/^https?:\/\//, "");
  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      toast.show({ message: "Your link is copied. Paste it anywhere." });
    } catch {
      toast.show({ message: `Couldn't copy. Your link is ${pretty}` });
    }
  }
  return (
    <button type="button" onClick={copy} aria-label={`Copy your link, ${pretty}`} className="flex w-full items-center gap-2 rounded-xl border border-line bg-ink p-3 text-left">
      <span className="min-w-0 flex-1 truncate text-xs text-bone">{pretty}</span>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/copy.svg" alt="" className="size-3.5 shrink-0" />
    </button>
  );
}
