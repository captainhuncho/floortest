import Link from "next/link";

/** The FloorTest crest and name. `ops` swaps in the brushed-silver crest used only on the admin side. */
export function Logo({ href = "/", className = "", ops = false }: { href?: string; className?: string; ops?: boolean }) {
  return (
    <Link href={href} className={`tap inline-flex items-center gap-2 text-lg font-bold tracking-tight ${className}`}>
      <img src={ops ? "/brand/crest-ops.svg" : "/brand/crest.svg"} alt="" aria-hidden className="size-7 shrink-0" />
      FloorTest
    </Link>
  );
}
