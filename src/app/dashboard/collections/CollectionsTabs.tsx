import Link from "next/link";

/**
 * One Collections menu with two groups (owner, 15 Nov): Callouts, what senders send to, and Projects, the desk's own
 * tracks. Both pages keep their own address; this row switches between them. Wide and plain so it's seen (owner, 15
 * Nov): two equal halves across the column, each saying what's in it.
 */
export function CollectionsTabs({ on }: { on: "callouts" | "projects" }) {
  const tabs = [
    { key: "callouts", href: "/dashboard/collections", label: "Callouts", hint: "What senders send to" },
    { key: "projects", href: "/dashboard/projects", label: "Projects", hint: "Your own tracks" },
  ] as const;
  return (
    <nav aria-label="Collections" className="mx-auto grid w-full max-w-2xl grid-cols-2 gap-1 rounded-2xl border border-line bg-well p-1">
      {tabs.map((t) => {
        const current = on === t.key;
        return (
          <Link
            key={t.key}
            href={t.href}
            aria-current={current ? "page" : undefined}
            className={`flex min-h-14 flex-col items-center justify-center rounded-xl px-3 py-2 text-center transition-colors ${current ? "bg-lime/15 text-lime ring-1 ring-lime/60" : "text-bone hover:bg-ink-4"}`}
          >
            <span className="text-[15px] font-semibold leading-tight">{t.label}</span>
            <span className={`text-[11.5px] leading-tight ${current ? "text-lime/80" : "text-mute"}`}>{t.hint}</span>
          </Link>
        );
      })}
    </nav>
  );
}
