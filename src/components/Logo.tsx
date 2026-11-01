import Link from "next/link";

/** FloorTest is in beta (owner, 29 Oct): every product logo carries the Beta tag. Set to false when beta ends. */
export const IN_BETA = true;

/** The lime "Beta" tag after the FloorTest name. `small` matches the sign-off logo. */
export function BetaTag({ small = false }: { small?: boolean }) {
  if (!IN_BETA) return null;
  return (
    <span
      className={`rounded-md border border-lime/40 font-mono font-medium uppercase text-lime ${
        small ? "px-1 text-[9px] leading-[14px] tracking-[0.1em]" : "px-1.5 py-px text-[10px] leading-4 tracking-[0.12em]"
      }`}
    >
      Beta
    </span>
  );
}

/**
 * The FloorTest crest and name, with the Beta tag while FloorTest is in beta. `ops` swaps in the brushed-silver crest used
 * only on the admin side (no tag there), same size and no effects (owner, 29 Oct: one look everywhere); `small` is the quiet sign-off at the foot of pages that lead with someone else's
 * name (the public send page, the sender's receipt). `compact` is the desk's phone bar (see below).
 */
export function Logo({ href = "/", className = "", ops = false, small = false, compact = false }: { href?: string; className?: string; ops?: boolean; small?: boolean; compact?: boolean }) {
  if (small)
    return (
      <Link href={href} className={`tap inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-tight text-dim hover:text-bone ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the crest is an SVG; Next's image optimizer doesn't process SVGs */}
        <img draggable={false} src="/brand/crest.svg" alt="" aria-hidden className="size-4 shrink-0" />
        FloorTest
        <BetaTag small />
      </Link>
    );
  return (
    <Link href={href} className={`tap inline-flex items-center gap-2 text-lg font-bold tracking-tight ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the crest is an SVG; Next's image optimizer doesn't process SVGs */}
      <img draggable={false} src={ops ? "/brand/crest-ops.svg" : "/brand/crest.svg"} alt="" aria-hidden className="size-7 shrink-0" />
      {/* compact: phones (under 640px) show the crest and the Beta tag, so the desk's top bar fits at 320px; the name stays for screen readers. */}
      {compact ? <span className="max-sm:sr-only">FloorTest</span> : "FloorTest"}
      {!ops && <BetaTag />}
    </Link>
  );
}
