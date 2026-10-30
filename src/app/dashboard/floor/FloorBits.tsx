/**
 * The Floor's building blocks (owner, 30 Oct: the "elevated" Floor from the redesign renders): stat tiles with an icon
 * box, info rows like a spec sheet, the desk strip and the week's chart. Small type, small boxes, one card surface.
 * Server components; the play controls live in UpNextHero.
 */

const PATHS = {
  inbox: "M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 13h4.5l1.5 2.5h4l1.5-2.5H20",
  heart: "M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z",
  head: "M4 15v-3a8 8 0 0 1 16 0v3M5 14h2.5v6H5a1.5 1.5 0 0 1-1.5-1.5v-3A1.5 1.5 0 0 1 5 14zM19 14h-2.5v6H19a1.5 1.5 0 0 0 1.5-1.5v-3A1.5 1.5 0 0 0 19 14z",
  check: "M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM8.5 12.2l2.4 2.4 4.6-5",
  wave: "M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10",
  tag: "M3.5 12.5V5a1.5 1.5 0 0 1 1.5-1.5h7.5l8 8-9 9zM8 6.7a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6z",
  user: "M12 5a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7zM5 20a7 7 0 0 1 14 0",
  folder: "M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z",
  clock: "M12 3.5a8.5 8.5 0 1 1 0 17 8.5 8.5 0 0 1 0-17zM12 7.5V12l3 2",
  up: "M12 19V5M6 11l6-6 6 6",
  chev: "M9 6l6 6-6 6",
} as const;

export type FloorIconName = keyof typeof PATHS;

export function FloorIcon({ name, className = "size-[18px]" }: { name: FloorIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d={PATHS[name]} />
    </svg>
  );
}

/** A small rounded label beside a figure: amber needs attention, green is good news, flat is context. */
export function Chip({ tone = "flat", children }: { tone?: "warn" | "up" | "flat"; children: React.ReactNode }) {
  const tones = { warn: "bg-[color-mix(in_oklab,#ffb35a_14%,transparent)] text-[#d98a2b]", up: "bg-[color-mix(in_oklab,#9be15d_14%,transparent)] text-[#6aa636]", flat: "bg-ink-4 text-mute" };
  return <span className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${tones[tone]}`}>{children}</span>;
}

/** The icon box the tiles and section titles share. */
export function IconBox({ name, small }: { name: FloorIconName; small?: boolean }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center border border-line bg-ink-2 text-bone ${small ? "size-8 rounded-[10px]" : "size-9 rounded-[11px]"}`}>
      <FloorIcon name={name} className={small ? "size-4" : "size-[18px]"} />
    </span>
  );
}

/** One number with its label: the label says what it counts, the chip its scope or change. */
export function StatTile({ icon, label, value, chip }: { icon: FloorIconName; label: string; value: string; chip?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-line bg-ink-3 p-2.5">
      <IconBox name={icon} />
      <dl className="min-w-0">
        <dt className="truncate text-[11.5px] text-mute">{label}</dt>
        <dd className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="text-[20px] font-semibold leading-tight tracking-[-0.035em] text-bone tnum">{value}</span>
          {chip}
        </dd>
      </dl>
    </div>
  );
}

/** A spec-sheet row: what it is on the left, the value on the right. */
export function InfoRow({ icon, label, children }: { icon: FloorIconName; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-[11px] border border-line bg-ink-2 px-2.5 py-2 text-[12px]">
      <dt className="flex min-w-0 flex-1 items-center gap-2 text-mute">
        <FloorIcon name={icon} className="size-[15px]" />
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right font-semibold text-bone">{children}</dd>
    </div>
  );
}

/** How full the desk is, as ticks: waiting (lime), kept (dim lime), not for me (grey), free (empty). Decorative; the legend says the numbers. */
export function DeskStrip({ waiting, kept, passed, limit }: { waiting: number; kept: number; passed: number; limit: number }) {
  const cells = Math.min(40, Math.max(limit, 1));
  const per = Math.max(limit, 1) / cells;
  return (
    <div aria-hidden className="flex h-6 gap-[2.5px]">
      {Array.from({ length: cells }, (_, i) => {
        const at = i * per;
        const tone = at < waiting ? "bg-lime" : at < waiting + kept ? "bg-[color-mix(in_oklab,var(--color-lime)_45%,var(--color-line-2))]" : at < waiting + kept + passed ? "bg-mute/55" : "bg-line-2";
        return <span key={i} className={`flex-1 rounded-[2px] ${tone}`} />;
      })}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; tone: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-mute">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className={`size-2 rounded-[2.5px] ${i.tone}`} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** The last seven days: received as grey bars, the kept part of each in lime. The numbers are in the text beside it. */
export function WeekChart({ days }: { days: { weekday: string; count: number; kept: number; today: boolean }[] }) {
  const top = Math.max(1, ...days.map((d) => Math.max(d.count, d.kept)));
  return (
    <div aria-hidden className="flex flex-col gap-1.5">
      <div className="grid h-24 grid-cols-7 items-end gap-2 border-b border-dashed border-line-2">
        {days.map((d, i) => {
          const kept = Math.min(d.kept, Math.max(d.count, d.kept));
          const rest = Math.max(0, d.count - kept);
          return (
            <div key={i} className="flex h-full flex-col justify-end gap-0.5">
              {rest > 0 && <span className="block rounded-[5px] bg-line-2" style={{ height: `${(rest / top) * 100}%` }} />}
              {kept > 0 && <span className="block rounded-[5px] bg-lime" style={{ height: `${(kept / top) * 100}%` }} />}
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7 gap-2 text-center text-[11px] text-faint">
        {days.map((d, i) => (
          <span key={i} className={d.today ? "font-semibold text-bone" : ""}>
            {d.weekday.slice(0, 1)}
          </span>
        ))}
      </div>
    </div>
  );
}
