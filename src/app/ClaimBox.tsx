"use client";

import { useRouter } from "next/navigation";
import { setClaimName, useClaim } from "./claimName";

const clean = (s: string) => s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "").slice(0, 30);
const HELP = {
  free: "Free right now. Add it to your invite request below.",
  taken: "Taken. Try another.",
  invalid: "Use 2–30 letters, numbers, - or _.",
  slow: "Too many checks. Try again in a bit.",
} as const;

/**
 * Type the link you want. In invite mode it carries the name to the waitlist (never reserved);
 * with open sign-up it goes straight to sign-up with the name filled in.
 * The home page has two (hero and end): both show the same name (claimName.ts). `end` is the second one: it has its
 * own field id and leaves the preview line and the spoken answer to the hero's box (one announcement, not two).
 */
export function ClaimBox({ host, inviteOnly, end = false }: { host: string; inviteOnly: boolean; end?: boolean }) {
  const { name, status } = useClaim();
  const router = useRouter();
  const id = end ? "claim-name-end" : "claim-name";

  function claim(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteOnly) return router.push(`/signup${name ? `?handle=${encodeURIComponent(name)}` : ""}`);
    window.dispatchEvent(new CustomEvent("floortest:claim", { detail: name }));
    document.getElementById("waitlist")?.scrollIntoView({ behavior: "smooth" });
    // Start them on the first empty field of the waitlist form.
    setTimeout(() => document.querySelector<HTMLInputElement>('#waitlist input[name="name"]')?.focus({ preventScroll: true }), 500);
  }

  // "kwame-beats" → "Kwame Beats'" for the preview line.
  const display = name.split(/[-_]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  const possessive = display.endsWith("s") ? `${display}’` : `${display}’s`;
  return (
    <form onSubmit={claim} data-claim={end ? "end" : "hero"} className={`w-full ${end ? "min-[900px]:mx-auto min-[900px]:max-w-[520px]" : "min-[900px]:max-w-[520px]"}`}>
      <label htmlFor={id} className="sr-only">
        Your link
      </label>
      <div className="flex flex-col gap-2.5 min-[900px]:flex-row">
        <div className="flex min-h-[52px] min-w-0 flex-1 items-center rounded-[14px] border border-field bg-ink-3 px-3.5 focus-within:border-bone focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-bone">
          <span className="min-w-0 max-w-[60%] shrink truncate text-base text-mute">{host}/</span>
          <input
            id={id}
            value={name}
            onChange={(e) => setClaimName(clean(e.target.value))}
            placeholder="yourname"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={30}
            // The whole field row shows focus instead (border and outline; the global outline would box just the name).
            style={{ outline: "none" }}
            // 16px on every size: a smaller field makes iPhones zoom the page on focus.
            className="min-w-[6rem] flex-1 bg-transparent py-3 text-base font-semibold text-bone outline-none placeholder:font-normal placeholder:text-faint"
          />
        </div>
        <button className="h1e-fill min-h-[52px] rounded-full px-5 text-base font-semibold">Claim your link</button>
      </div>
      <p className="mt-2.5 text-sm text-bone empty:mt-0" aria-live={end ? "off" : "polite"}>
        {status ? (inviteOnly || status !== "free" ? HELP[status] : "Free right now.") : ""}
      </p>
      {display && !end && (
        <p className="mt-1 font-[family-name:var(--font-serif)] text-lg italic text-bone">
          {possessive} desk · tracks for your next set
        </p>
      )}
    </form>
  );
}
