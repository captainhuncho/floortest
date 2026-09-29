"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { checkHandle } from "./waitlist/actions";

const clean = (s: string) => s.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "").slice(0, 30);
const HELP = {
  free: "Free right now. Join the waitlist to request it.",
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
  const [status, setStatus] = useState<keyof typeof HELP | null>(null);
  const router = useRouter();

  useEffect(() => {
    setStatus(null);
    if (name.length < 2) return;
    const t = setTimeout(async () => setStatus(await checkHandle(name)), 400);
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
        Your receiving link
      </label>
      <div className="mt-4 flex items-stretch border border-white/20 bg-black/30 focus-within:border-lime/70">
        <span className="min-w-0 max-w-[60%] shrink self-center truncate pl-3 font-[family-name:var(--font-stage-mono)] text-sm text-[#8f8377] sm:text-base">{host}/</span>
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
          className="min-w-[6rem] flex-1 bg-transparent py-3 pr-2 font-[family-name:var(--font-stage-mono)] text-sm text-lime outline-none placeholder:text-[#5f5a52] sm:text-base"
        />
      </div>
      <button className="mt-3 w-full bg-lime px-4 py-3 font-[family-name:var(--font-stage-mono)] text-sm font-medium uppercase text-ink hover:brightness-95">
        Claim your link →
      </button>
      <p className="mt-3 min-h-5 font-[family-name:var(--font-stage-mono)] text-xs text-[#a8a59c]" aria-live="polite">
        {status ? (inviteOnly || status !== "free" ? HELP[status] : "Free right now.") : inviteOnly ? "Private beta · invite only" : ""}
      </p>
      {display && (
        <p className="mt-1 font-[family-name:var(--font-serif)] text-lg italic text-[#d8cfc4]">
          {possessive} desk · tracks for your next set
        </p>
      )}
    </form>
  );
}
