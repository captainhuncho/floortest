"use client";

import { useToast } from "@/components/Toast";

export function InviteLink({ link, code }: { link: string; code: string }) {
  const toast = useToast();
  return (
    <div>
      <p className="label">Your invite link</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input readOnly value={link} aria-label="Invite link" className="input min-w-0 flex-1 font-mono" onFocus={(e) => e.currentTarget.select()} />
        <button
          className="btn-lime btn-sm"
          onClick={async () => {
            if (navigator.share) {
              try {
                await navigator.share({ title: "FloorTest invite", text: "I use FloorTest for demos: one link, every track in one place, and senders get told when you've listened. Here's an invite:", url: link });
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
      <p className="mt-2 text-sm text-mute">
        Code <span className="font-mono text-bone">{code}</span>
      </p>
    </div>
  );
}
