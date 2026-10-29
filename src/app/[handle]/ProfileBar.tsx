"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Keeps the receiver in view on the send page (owner, 29 Oct). The full profile sits at the top; once it scrolls out,
 * a slim bar with the photo, name and callout comes down from the top edge, and leaves again when the profile is
 * back. It repeats what the header says, so screen readers skip it. Reduced motion: it fades without moving.
 */
export function ProfileBar({ cover, name, callout, children }: { cover: string | null; name: string; callout: string | null; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [away, setAway] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setAway(!e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <>
      <div ref={ref}>{children}</div>
      <div
        aria-hidden
        data-profile-bar
        inert={!away}
        className={`fixed inset-x-0 top-0 z-30 border-b border-line bg-ink/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm transition-[opacity,translate] duration-200 ease-[var(--ease-out)] motion-reduce:translate-y-0 ${away ? "opacity-100" : "pointer-events-none -translate-y-full opacity-0"}`}
      >
        <div className="mx-auto flex h-12 max-w-[600px] items-center gap-2.5 px-[18px] text-sm">
          {cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cover} alt="" className="size-7 shrink-0 rounded-md object-cover" />
          )}
          <span className="shrink-0 font-semibold text-bone">{name}</span>
          {callout && (
            <span className="min-w-0 truncate text-[13px] text-mute">
              <span aria-hidden className="mr-1.5 inline-block size-1.5 -translate-y-px rounded-full bg-lime" />
              Receiving for {callout}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
