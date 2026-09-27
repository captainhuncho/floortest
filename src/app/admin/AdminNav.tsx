"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavGroup = { title: string; items: { href: string; label: string; badge?: number }[] };

/** Admin menu grouped by job: watch the platform, help people, grow the beta, keep it safe. */
export function AdminNav({ groups }: { groups: NavGroup[] }) {
  const path = usePathname();
  const active = (href: string) => (href === "/admin" ? path === "/admin" : path.startsWith(href));
  return (
    <nav aria-label="Admin" className="flex gap-6 overflow-x-auto pb-2 md:flex-col md:gap-5 md:overflow-visible md:pb-0">
      {groups.map((g) => (
        <div key={g.title} className="shrink-0">
          <p className="label mb-1.5 px-3">{g.title}</p>
          <ul className="flex gap-1 md:flex-col md:gap-0.5">
            {g.items.map((i) => (
              <li key={i.href}>
                <Link
                  href={i.href}
                  aria-current={active(i.href) ? "page" : undefined}
                  className={`flex items-center justify-between gap-3 whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${
                    active(i.href) ? "bg-ink-3 text-bone" : "text-mute hover:bg-ink-2 hover:text-bone"
                  }`}
                >
                  {i.label}
                  {!!i.badge && <span className="rounded-sm bg-lime px-1.5 text-xs font-semibold text-ink tnum">{i.badge}</span>}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}
