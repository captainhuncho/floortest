"use client";

import { useToast } from "@/components/Toast";

export function InviteLink({ link, code }: { link: string; code: string }) {
  const toast = useToast();
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[13px] font-semibold text-mute">Your invite link</p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link}
          aria-label="Invite link"
          className="input min-h-11 min-w-0 flex-1 truncate rounded-xl font-mono text-[16px]!"
          onFocus={(e) => e.currentTarget.select()}
        />
        <button
          className="btn-lime min-h-11 shrink-0 rounded-[13px] px-4"
          onClick={async () => {
            if (navigator.share) {
              try {
                await navigator.share({ title: "FloorTest invite", text: "I use FloorTest for new music: one link, every track in one place, and senders get told when you've listened. Here's an invite:", url: link });
                return;
              } catch {}
            }
            await navigator.clipboard?.writeText(link);
            toast.show({ message: "Invite link copied" });
          }}
        >
          Share invite
        </button>
      </div>
      <p className="text-[12px] text-mute">
        Code <span className="font-mono font-semibold text-bone">{code}</span>
      </p>
    </div>
  );
}
