"use client";

import Link from "next/link";
import { useState } from "react";
import { Dialog, DIALOG_QUIET } from "@/components/Dialog";
import { opsSignOut } from "../../ops-login/actions";
import { Icon, type IconName } from "../AdminNav";
import { OPEN_PALETTE_EVENT } from "../kit/Palette";
import { isActive, type ShellArea } from "./model";
import type { Me } from "./Rail";

const TAB = "ops-press relative flex min-h-14 flex-col items-center justify-center gap-0.5 rounded-full text-[10.5px] font-semibold";

/**
 * Phones (below 768px, B's phone frame): a floating bottom bar with Waiting, Inbox, Users, Search and More (each only
 * if this person can open it), and More opens a sheet with every area and page. The bar is glass (it floats); the
 * sheet is the app's one Dialog, so Escape closes it and focus comes back to More.
 */
export function PhoneNav({ areas, total, path, me }: { areas: ShellArea[]; total: number; path: string; me: Me }) {
  const [open, setOpen] = useState(false);
  // A page change (a link in the sheet) closes the sheet.
  const [openOn, setOpenOn] = useState(path);
  if (openOn !== path) {
    setOpenOn(path);
    setOpen(false);
  }
  const pages = areas.flatMap((a) => a.sections.flatMap((s) => s.items));
  const has = (href: string) => pages.find((p) => p.href === href);
  const tabs: { href: string; label: string; icon: IconName; badge: number }[] = [
    ...(has("/admin") ? [{ href: "/admin", label: "Waiting", icon: "clock" as const, badge: total }] : []),
    ...(has("/admin/inbox") ? [{ href: "/admin/inbox", label: "Inbox", icon: "inbox" as const, badge: has("/admin/inbox")!.count }] : []),
    ...(has("/admin/accounts") ? [{ href: "/admin/accounts", label: "Users", icon: "users" as const, badge: 0 }] : []),
  ];
  const onTab = tabs.some((t) => isActive(path, t.href));
  return (
    <>
      <nav aria-label="Ops shortcuts" className="kit-glass fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+8px)] z-30 rounded-full px-1.5 md:hidden">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${tabs.length + 2}, minmax(0, 1fr))` }}>
          {tabs.map((t) => {
            const on = isActive(path, t.href);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  aria-label={`${t.label}${t.badge ? `, ${t.badge} waiting` : ""}`}
                  className={`${TAB} ${on ? "bg-ink-4/80 text-bone" : "text-mute"}`}
                >
                  <Icon name={t.icon} className={`size-5 ${on ? "text-lime" : ""}`} />
                  <span aria-hidden>{t.label}</span>
                  {t.badge > 0 && (
                    <span aria-hidden className="absolute left-1/2 top-1 ml-1.5 min-w-[18px] rounded-[9px] bg-lime px-1 text-center text-[10.5px] font-bold leading-[18px] text-[#10110f] tnum">
                      {t.badge}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
          <li>
            <button type="button" onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))} className={`${TAB} w-full text-mute`}>
              <Icon name="search" className="size-5" />
              Search
            </button>
          </li>
          <li>
            <button type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={`${TAB} w-full ${onTab || open ? "text-mute" : "bg-ink-4/80 text-bone"}`}>
              <Icon name="more" className={`size-5 ${onTab || open ? "" : "text-lime"}`} />
              More
            </button>
          </li>
        </ul>
      </nav>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="All pages"
        actions={
          <button type="button" className={DIALOG_QUIET} onClick={() => setOpen(false)}>
            Close
          </button>
        }
      >
        <nav aria-label="All ops pages">
          {areas.map((a) => (
            <section key={a.id} aria-labelledby={`ops-more-${a.id}`} className="mt-3 first:mt-0">
              <h3 id={`ops-more-${a.id}`} className="flex items-center gap-2 px-1 pb-1 text-[12px] font-semibold text-mute">
                <Icon name={a.icon} className="size-4" />
                {a.title}
                {a.waiting > 0 && <span className="text-faint">· {a.waiting} waiting</span>}
              </h3>
              <ul className="flex flex-col">
                {a.sections.flatMap((s) => s.items).map((p) => {
                  const on = isActive(path, p.href);
                  return (
                    <li key={p.href}>
                      <Link href={p.href} aria-current={on ? "page" : undefined} className={`flex min-h-11 items-center justify-between gap-3 rounded-[11px] px-2.5 text-[16px] ${on ? "bg-ink-4 font-semibold text-bone" : "text-bone"}`}>
                        {p.label}
                        {p.count > 0 && (
                          <span className={p.hot ? "rounded-[7px] bg-lime px-1.5 text-[12px] font-bold text-[#10110f] tnum" : "text-[13px] text-faint tnum"}>
                            {p.count}
                            {p.hot && <span className="sr-only"> waiting</span>}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
        <form action={opsSignOut} className="mt-4 border-t border-line pt-3">
          <p className="px-1 text-[12px] text-mute">
            {me.name} · {me.role}
          </p>
          <button className="mt-1 flex min-h-11 w-full items-center rounded-[11px] px-2.5 text-left text-[16px] text-bone">Sign out of ops</button>
        </form>
      </Dialog>
    </>
  );
}
