"use client";

import { useEffect, useRef, useState } from "react";
import { useActionForm } from "@/components/useActionForm";
import { requestSenderLink } from "./actions";
import { Turnstile } from "@/components/Turnstile";
import { Disc, QUIET } from "./parts";

/**
 * The button's bar. Under the field on wider screens. On phones it is pinned to the bottom of the screen and lifted
 * by the height of the on-screen keyboard, so "Email me my link" stays in view while typing: a phone keyboard covers
 * the bottom of the page without resizing it, and the visual viewport says by how much.
 */
function ButtonBar({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const vv = window.visualViewport;
    const el = ref.current;
    if (!vv || !el) return;
    const place = () => {
      // Pinch-zoomed: the viewport is smaller for another reason, so leave the bar where the page puts it.
      const zoomed = Math.abs(vv.scale - 1) > 0.01;
      const covered = zoomed ? 0 : Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
      el.style.setProperty("--kb", `${covered}px`);
    };
    place();
    vv.addEventListener("resize", place);
    vv.addEventListener("scroll", place);
    return () => {
      vv.removeEventListener("resize", place);
      vv.removeEventListener("scroll", place);
    };
  }, []);
  return (
    <div
      ref={ref}
      className="max-sm:fixed max-sm:inset-x-0 max-sm:bottom-[var(--kb,0px)] max-sm:bg-ink max-sm:pb-[calc(1.75rem+env(safe-area-inset-bottom))] max-sm:pl-[max(0.875rem,env(safe-area-inset-left))] max-sm:pr-[max(0.875rem,env(safe-area-inset-right))] max-sm:pt-3"
    >
      {children}
    </div>
  );
}

export function SentForm({ botCheckKey }: { botCheckKey: string | null }) {
  const [state, onSubmit, pending] = useActionForm(requestSenderLink, undefined);
  // "Use a different email" puts the form back, empty: the answer it dismissed is remembered, so the next one shows.
  const [dismissed, setDismissed] = useState<typeof state>(undefined);
  if (state?.ok && state !== dismissed)
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3.5 pb-10 text-center">
        <div role="status" className="flex flex-col items-center gap-3.5">
          <Disc icon="mail" />
          <h1 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.02em]">Check your email</h1>
          <p className="max-w-[30ch] text-[13px] leading-5 text-mute">If you&apos;ve sent music through FloorTest from that address, a link is on its way. It works for 24 hours.</p>
        </div>
        <button type="button" onClick={() => setDismissed(state)} className={`${QUIET} min-w-[220px] px-[22px]`}>
          Use a different email
        </button>
      </div>
    );
  return (
    <div className="mt-7 flex flex-col">
      <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.02em]">Everything you&apos;ve sent</h1>
      <p className="mt-2 text-[13px] leading-5 text-mute">
        We&apos;ll email you a private link to every track you&apos;ve sent and what happened to it. No account or password.
      </p>
      <form method="post" onSubmit={onSubmit} className="mt-5 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-mute">Your email</span>
          <input name="email" type="email" required autoComplete="email" className="input min-h-[46px] w-full rounded-xl text-[16px]!" placeholder="The one you send music from" />
        </label>
        <Turnstile action="sent" siteKey={botCheckKey} />
        {state?.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}
        <ButtonBar>
          <button className="btn-lime min-h-12 w-full rounded-full text-[14.5px] font-bold" disabled={pending}>
            {pending ? "Sending…" : "Email me my link"}
          </button>
        </ButtonBar>
      </form>
    </div>
  );
}
