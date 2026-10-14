"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkHandle } from "./waitlist/actions";

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
 */
export function ClaimBox({ host, inviteOnly }: { host: string; inviteOnly: boolean }) {
  const [name, setName] = useState("");
  // The check's answer, kept with the name it was for: a newer name shows nothing until its own answer arrives.
  const [answer, setAnswer] = useState<{ name: string; status: keyof typeof HELP | null } | null>(null);
  const status = answer?.name === name ? answer.status : null;
  const router = useRouter();

  useEffect(() => {
    if (name.length < 2) return;
    const t = setTimeout(async () => setAnswer({ name, status: await checkHandle(name) }), 400);
    return () => clearTimeout(t);
  }, [name]);

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
    <form onSubmit={claim}>
      <label htmlFor="claim-name" className="home-label">
        Your link
      </label>
      <div className="mt-4 flex items-stretch border border-white/20 bg-black/30 focus-within:border-lime/70">
        <span className="min-w-0 max-w-[60%] shrink self-center truncate pl-3 text-sm text-dim sm:text-base">{host}/</span>
        <input
          id="claim-name"
          value={name}
          onChange={(e) => setName(clean(e.target.value))}
          placeholder="yourname"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          // The whole field row shows focus instead (the global outline would box just the name).
          style={{ outline: "none" }}
          className="min-w-[6rem] flex-1 bg-transparent py-3 pr-2 text-sm text-lime outline-none placeholder:text-faint sm:text-base"
        />
      </div>
      {/* Secondary (bone outline): the hero's own CTA is the one lime button. */}
      <button className="mt-3 w-full border border-bone/70 px-4 py-3 text-sm font-medium uppercase text-bone hover:border-bone hover:bg-white/5">
        {inviteOnly ? "Check it's free →" : "Claim your link →"}
      </button>
      <p className="mt-3 min-h-5 text-xs text-mute" aria-live="polite">
        {status ? (inviteOnly || status !== "free" ? HELP[status] : "Free right now.") : inviteOnly ? "Private beta · invite only" : ""}
      </p>
      {display && (
        <p className="mt-1 font-[family-name:var(--font-serif)] text-lg italic text-bone">
          {possessive} desk · tracks for your next set
        </p>
      )}
    </form>
  );
}
