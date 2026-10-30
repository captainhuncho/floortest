"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CARD } from "@/components/Kit";

/** Each page with the least team role that can open it (on your own desk you're the owner, so you see all of them). */
export const SECTIONS = [
  { slug: "profile", title: "Profile", sub: "Photo, name, link and profiles", min: "admin" },
  { slug: "receiving", title: "Receiving", sub: "Blocked senders and desk rules", min: "admin" },
  { slug: "team", title: "Team", sub: "People on this account, roles and approvals", min: "member" },
  { slug: "notifications", title: "Notifications", sub: "How and when we email you", min: "owner" },
  { slug: "plan", title: "Plan", sub: "Usage and plans", min: "owner" },
  { slug: "security", title: "Security", sub: "Email, password, two-step sign-in", min: "owner" },
  { slug: "account", title: "Account", sub: "Keyboard shortcuts, log out or delete your account", min: "member" },
] as const;
const RANK = { member: 1, admin: 2, owner: 3 } as const;
export const sectionsFor = (role: keyof typeof RANK, teams: boolean) =>
  SECTIONS.filter((s) => RANK[role] >= RANK[s.min] && (s.slug !== "team" || teams));

/** Desktop: a left rail of the settings pages. Phones: a back link to the Account menu. */
export function SettingsNav({ role, teams }: { role: keyof typeof RANK; teams: boolean }) {
  const path = usePathname();
  const sections = sectionsFor(role, teams);
  const current = SECTIONS.find((s) => path.startsWith(`/dashboard/settings/${s.slug}`));
  return (
    <>
      {/* Phones: the way back to the Account menu (the page's own title says where you are). */}
      <div className="mb-1 flex h-11 items-center md:hidden">
        <Link href="/dashboard/account" aria-label="Back to Account" className="-ml-2 flex min-h-11 items-center gap-1.5 rounded-[11px] px-2 text-[12px] text-mute hover:text-bone">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/arrow-left.svg" alt="" className="size-4" />
          Account
        </Link>
      </div>
      <nav aria-label="Settings" className={`${CARD} hidden p-2 md:sticky md:top-6 md:block`}>
        <p className="px-2.5 pb-1.5 pt-1 text-[11.5px] font-semibold text-mute">Settings</p>
        <ul className="flex flex-col gap-0.5">
          {sections.map((s) => {
            const on = current?.slug === s.slug;
            return (
              <li key={s.slug}>
                <Link
                  href={`/dashboard/settings/${s.slug}`}
                  aria-current={on ? "page" : undefined}
                  className={`flex min-h-10 items-center rounded-[11px] px-2.5 text-[13px] ${on ? "bg-lime/12 font-semibold text-lime" : "text-mute hover:bg-well hover:text-bone"}`}
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
