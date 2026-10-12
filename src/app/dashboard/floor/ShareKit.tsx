"use client";

import { useToast } from "@/components/Toast";

/**
 * Everything needed to post the link once: a ready caption (copied in one tap) and the link's QR code to save for a story.
 * Onboarding's one job is the first track within 48 hours, and that starts with the link being somewhere senders look.
 */
export function ShareKit({ link, handle }: { link: string; handle: string }) {
  const toast = useToast();
  const caption = `Sending me music? Send the track here: ${link}. You'll know when I've listened.`;
  async function copy() {
    try {
      await navigator.clipboard.writeText(caption);
      toast.show({ message: "Caption copied. Paste it in your bio, a story or a callout." });
    } catch {
      toast.show({ message: "Couldn't copy. Select the caption and copy it." });
    }
  }
  return (
    <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-start">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="select-all rounded-lg border border-line bg-ink px-3 py-2.5 text-[12px] leading-5 text-bone">{caption}</p>
        <button type="button" onClick={copy} className="btn-ghost btn-sm w-fit">
          Copy caption
        </button>
      </div>
      <a
        href={`/api/qr/${handle}?format=png&download=1`}
        className="flex w-fit items-center gap-3 rounded-lg border border-line bg-ink p-2 pr-3 text-[12px] font-semibold text-bone hover:border-line-2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/qr/${handle}`} alt="" width={56} height={56} className="size-14 rounded bg-white" />
        Save QR for a story
      </a>
    </div>
  );
}
