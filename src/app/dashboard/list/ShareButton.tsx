"use client";

import { useToast } from "@/components/Toast";

export function ShareButton({ link }: { link: string }) {
  const toast = useToast();
  return (
    <button
      className="btn btn-sm bg-bone font-semibold text-ink hover:bg-white"
      onClick={async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title: "Send me your music", url: link });
            return;
          } catch {}
        }
        await navigator.clipboard?.writeText(link);
        toast.show({ message: "Receiver link copied" });
      }}
    >
      Share
    </button>
  );
}
