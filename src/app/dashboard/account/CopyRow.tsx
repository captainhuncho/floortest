"use client";

import { useToast } from "@/components/Toast";

export function CopyRow({ link }: { link: string }) {
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
    <div className="flex flex-col gap-2 py-0.5">
      <div className="flex items-center justify-between gap-3">
        <span className="shrink-0 text-[13px] font-medium text-[#f1f1eb]">Your submission link</span>
        <span className="min-w-0 truncate text-[11px] text-[#a3a69b]">{pretty}</span>
      </div>
      <button
        type="button"
        onClick={copy}
        className="w-fit self-end rounded-full bg-lime px-3 py-1 text-[10px] font-bold uppercase tracking-[0.5px] text-[#10110f]"
      >
        Copy link
      </button>
    </div>
  );
}
