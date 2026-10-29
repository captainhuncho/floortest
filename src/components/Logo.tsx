import Link from "next/link";

/**
 * The FloorTest crest and name. `ops` swaps in the brushed-silver crest used only on the admin side; `small` is the quiet
 * sign-off at the foot of pages that lead with someone else's name (the public send page, the sender's receipt). `beta`
 * adds the Beta tag after the name, shown on sign in, sign up and the dashboard while FloorTest is in beta (owner, 29 Oct).
 */
export function Logo({ href = "/", className = "", ops = false, small = false, beta = false }: { href?: string; className?: string; ops?: boolean; small?: boolean; beta?: boolean }) {
  if (small)
    return (
      <Link href={href} className={`tap inline-flex items-center gap-1.5 text-[12px] font-semibold tracking-tight text-dim hover:text-bone ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- the crest is an SVG; Next's image optimizer doesn't process SVGs */}
        <img draggable={false} src="/brand/crest.svg" alt="" aria-hidden className="size-4 shrink-0" />
        FloorTest
      </Link>
    );
  return (
    <Link href={href} className={`tap inline-flex items-center gap-2 text-lg font-bold tracking-tight ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the crest is an SVG; Next's image optimizer doesn't process SVGs */}
      <img draggable={false} src={ops ? "/brand/crest-ops.svg" : "/brand/crest.svg"} alt="" aria-hidden className={ops ? "crest-ops size-10 shrink-0" : "size-7 shrink-0"} />
      FloorTest
      {beta && (
        <span className="rounded-md border border-lime/40 px-1.5 py-px font-mono text-[10px] font-medium uppercase leading-4 tracking-[0.12em] text-lime">
          Beta
        </span>
      )}
    </Link>
  );
}
