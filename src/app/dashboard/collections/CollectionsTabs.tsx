import Link from "next/link";
import { SEG, segTab } from "@/components/Kit";

/**
 * One Collections menu with two groups (owner, 15 Nov): Callouts, what senders send to, and Projects, the desk's own
 * tracks. Both pages keep their own address; this row switches between them.
 */
export function CollectionsTabs({ on }: { on: "callouts" | "projects" }) {
  const tabs = [
    { key: "callouts", href: "/dashboard/collections", label: "Callouts" },
    { key: "projects", href: "/dashboard/projects", label: "Projects" },
  ] as const;
  return (
    <nav aria-label="Collections" className={`${SEG} self-start`}>
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={on === t.key ? "page" : undefined} className={`${segTab(on === t.key)} min-h-11 px-4 text-[13px] sm:min-h-9`}>
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
