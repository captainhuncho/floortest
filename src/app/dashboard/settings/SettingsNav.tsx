"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const SECTIONS = [
  { slug: "profile", title: "Profile", sub: "Photo, name, link and profiles" },
  { slug: "receiving", title: "Receiving", sub: "Blocked senders and desk rules" },
  { slug: "notifications", title: "Notifications", sub: "How and when we email you" },
  { slug: "plan", title: "Plan", sub: "Usage and plans" },
  { slug: "security", title: "Security", sub: "Email, password, two-step sign-in" },
  { slug: "account", title: "Account", sub: "Log out or delete your account" },
] as const;

/** Desktop: a left rail of the six settings pages. Phones: a back link to the Account menu and this page's name. */
export function SettingsNav() {
  const path = usePathname();
  const current = SECTIONS.find((s) => path.startsWith(`/dashboard/settings/${s.slug}`));
  return (
    <>
      <div className="flex h-12 items-center gap-2 md:hidden">
        <Link href="/dashboard/account" aria-label="Back to Account" className="grid size-11 place-items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/arrow-left.svg" alt="" className="size-4" />
        </Link>
        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-mute">{current?.title ?? "Settings"}</span>
      </div>
      <nav aria-label="Settings" className="hidden md:block">
        <p className="mb-3 px-3 text-[11px] font-bold uppercase tracking-[0.5px] text-mute">Settings</p>
        <ul className="space-y-0.5">
          {SECTIONS.map((s) => {
            const on = current?.slug === s.slug;
            return (
              <li key={s.slug}>
                <Link
                  href={`/dashboard/settings/${s.slug}`}
                  aria-current={on ? "page" : undefined}
                  className={`block rounded-lg px-3 py-2.5 text-sm ${on ? "bg-ink-3 font-semibold text-bone" : "text-mute hover:bg-ink-2 hover:text-bone"}`}
                >
                  {s.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}
