import Link from "next/link";
import { Crest } from "./Crest";

/** The FloorTest crest and name. `ops` swaps in the brushed-silver crest used only on the admin side. */
export function Logo({ href = "/", className = "", ops = false }: { href?: string; className?: string; ops?: boolean }) {
  return (
    <Link href={href} className={`tap inline-flex items-center gap-2 text-lg font-bold tracking-tight ${className}`}>
      {ops ? (
        // The ops crest never moves.
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/brand/crest-ops.svg" alt="" aria-hidden className="crest-ops size-10 shrink-0" />
      ) : (
        <Crest />
      )}
      FloorTest
    </Link>
  );
}
