"use client";

import { useToast } from "@/components/Toast";

export function CopyRow({ link }: { link: string }) {
  const toast = useToast();
  const pretty = link.replace(/^https?:\/\//, "");
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(link);
          toast.show({ message: "Your link is copied. Paste it anywhere." });
        } catch {
          toast.show({ message: `Couldn't copy. Your link is ${pretty}` });
        }
      }}
      className="flex items-center justify-between gap-3 py-0.5 text-left"
    >
      <span className="shrink-0 text-[13px] font-medium text-[#f1f1eb]">Your submission link</span>
      <span className="min-w-0 truncate text-[11px] text-[#a3a69b]">{pretty}</span>
    </button>
  );
}
