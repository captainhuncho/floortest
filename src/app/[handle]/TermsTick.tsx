"use client";

/**
 * The one Terms tick on a send without an account (Research brief, owner 15 Nov). Shown on a sender's first send and
 * again when the Terms change, with an "Updated" line and a link to the whole text. Send waits until it's ticked.
 */
export function TermsTick({ checked, onChange, updated, hash }: { checked: boolean; onChange: (v: boolean) => void; updated: string | null; hash: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      {updated && (
        <p className="text-[12.5px] font-semibold text-bone">
          The Terms were updated {updated}.{" "}
          <a href="/terms" target="_blank" rel="noopener" className="font-normal text-mute underline underline-offset-4">
            Read the whole Terms
          </a>
        </p>
      )}
      <label className="flex min-h-11 items-center gap-2.5 text-[13px] leading-[19px] text-mute">
        <input type="checkbox" name="terms_tick" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-[18px] shrink-0 accent-lime" />
        <span>
          I have read, understood and agree to the{" "}
          <a href="/terms" target="_blank" rel="noopener" className="underline underline-offset-4">
            Terms
          </a>
          , including that music I send may be played by the receiver, and have read the{" "}
          <a href="/privacy" target="_blank" rel="noopener" className="underline underline-offset-4">
            Privacy Policy
          </a>
          .
        </span>
      </label>
      {hash && <input type="hidden" name="terms_hash" value={hash} />}
    </div>
  );
}
