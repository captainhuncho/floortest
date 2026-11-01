"use client";

import Link from "next/link";
import { Icon } from "../AdminNav";
import { isActive, type AreaToday, type NextDue, type ShellArea, type ShellPage } from "./model";

/** What a quiet count means, said to screen readers (hot counts are "N waiting"). */
const QUIET: Record<string, string> = { "/admin/feedback": "new", "/admin/waitlist": "not invited yet", "/admin/moderation": "with a signal" };

/**
 * The section panel (admin redesign B): the open area's pages with their counts, the next item due there with its
 * link, and figures only where real data exists. Solid (B fix 9). Docked from 1100px unless collapsed; otherwise it
 * opens over the page from the rail and Escape, a click away or a page change closes it (OpsShell).
 */
export function Panel({
  ref,
  area,
  path,
  next,
  today,
  peek,
  onClose,
  onCollapse,
}: {
  ref: React.Ref<HTMLElement>;
  area: ShellArea;
  path: string;
  next: NextDue | undefined;
  today: AreaToday | undefined;
  peek: boolean;
  onClose: () => void;
  onCollapse: () => void;
}) {
  return (
    <aside ref={ref} id="ops-panel" aria-labelledby="ops-panel-h" className="ops-panel flex-col border-r border-line bg-ink-2">
      <div className="flex items-center justify-between gap-2 pb-1 pl-4 pr-2 pt-3">
        <h2 id="ops-panel-h" className="truncate text-[15px] font-semibold tracking-[-0.015em] text-bone">
          {area.title}
        </h2>
        {peek ? (
          <button type="button" onClick={onClose} aria-label="Close the side panel" className="ops-press grid size-11 place-items-center rounded-[11px] text-faint hover:bg-ink-3 hover:text-bone">
            <span aria-hidden className="text-[20px] leading-none">×</span>
          </button>
        ) : (
          <button type="button" onClick={onCollapse} aria-label="Collapse the side panel" className="ops-press grid size-11 place-items-center rounded-[11px] text-faint hover:bg-ink-3 hover:text-bone">
            <Icon name="chevron" className="size-4" />
          </button>
        )}
      </div>
      <div key={area.id} className="admin-rise flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain px-2 pb-4">
        <nav aria-label={`${area.title} pages`}>
          {area.sections.map((s) => (
            <div key={s.title || area.id}>
              {s.title && <p className="px-2.5 pb-1 pt-3 text-[11.5px] font-semibold text-faint">{s.title}</p>}
              <ul className="flex flex-col gap-0.5">
                {s.items.map((p) => (
                  <li key={p.href}>
                    <PageLink page={p} on={isActive(path, p.href)} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        {next && <NextCard next={next} />}
        {today && <Today today={today} />}
      </div>
    </aside>
  );
}

function PageLink({ page, on }: { page: ShellPage; on: boolean }) {
  return (
    <Link
      href={page.href}
      aria-current={on ? "page" : undefined}
      className={`flex min-h-11 items-center gap-2.5 rounded-[11px] px-2.5 text-[13.5px] transition-colors duration-150 ${on ? "bg-ink-4 font-semibold text-bone" : "text-mute hover:bg-ink-3 hover:text-bone"}`}
    >
      <Icon name={page.icon} className={`size-4 shrink-0 ${on ? "text-lime" : ""}`} />
      <span className="min-w-0 flex-1 truncate">{page.label}</span>
      {page.count > 0 &&
        (page.hot ? (
          <span className="rounded-[7px] bg-lime px-1.5 text-[11px] font-bold leading-[18px] text-[#10110f] tnum">
            {page.count}
            <span className="sr-only"> waiting</span>
          </span>
        ) : (
          <span className="text-[12px] text-faint tnum">
            {page.count}
            {QUIET[page.href] && <span className="sr-only"> {QUIET[page.href]}</span>}
          </span>
        ))}
    </Link>
  );
}

function NextCard({ next }: { next: NextDue }) {
  return (
    <section aria-labelledby="ops-next-h" className="mx-0.5 mt-4 rounded-[14px] bg-ink-3 p-3">
      <h3 id="ops-next-h" className="text-[11.5px] font-semibold text-mute">
        Next due
      </h3>
      <p className="mt-1 truncate text-[13.5px] font-semibold text-bone">{next.title}</p>
      <p className="truncate text-[12px] text-mute">
        {next.subtitle} · <span className={next.late ? "font-semibold text-[var(--admin-amber)]" : ""}>{next.when}</span>
      </p>
      <Link href={next.href} className="ops-press mt-2 inline-flex min-h-11 items-center rounded-[10px] bg-ink-4 px-3.5 text-[13px] font-semibold text-bone hover:bg-line-2">
        Open<span className="sr-only">: {next.title}</span>
      </Link>
    </section>
  );
}

function Today({ today }: { today: AreaToday }) {
  return (
    <section aria-labelledby="ops-today-h" className="mx-0.5 mt-3">
      <h3 id="ops-today-h" className="px-0.5 pb-1.5 text-[11.5px] font-semibold text-mute">
        Today
      </h3>
      <dl className="grid grid-cols-2 gap-2">
        <div className="rounded-[12px] bg-ink-3 px-3 py-2">
          <dt className="text-[11.5px] text-mute">Waiting now</dt>
          <dd className="text-[17px] font-semibold text-bone tnum">{today.waiting}</dd>
        </div>
        <div className="rounded-[12px] bg-ink-3 px-3 py-2">
          <dt className="text-[11.5px] text-mute">Past due</dt>
          <dd className={`text-[17px] font-semibold tnum ${today.late ? "text-[var(--admin-amber)]" : "text-bone"}`}>
            {today.late}
            {today.lateMore && today.late ? "+" : ""}
          </dd>
        </div>
      </dl>
    </section>
  );
}
