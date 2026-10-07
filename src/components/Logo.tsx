import Link from "next/link";

export function Logo({ href = "/", className = "" }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={`tap inline-flex items-center gap-2 text-lg font-bold tracking-tight ${className}`}>
      <span aria-hidden className="grid h-6 w-6 place-items-center rounded-full bg-lime">
        <span className="h-2 w-2 rounded-full bg-ink" />
      </span>
      FloorTest
    </Link>
  );
}
