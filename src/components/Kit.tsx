/**
 * The desk's shared building blocks (owner, 30 Oct: every page matches the redesign mocks, the Floor first): one card
 * surface, an icon box beside section titles, small chips, spec-sheet rows and a page head with a small label over the
 * title. Small type, small boxes. Server-safe: no hooks, so client and server components can both use them.
 */

const ICONS = {
  bell: <><path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9" /><path d="M10 20a2.2 2.2 0 0 0 4 0" /></>,
  inbox: <><path d="M4 13l2.5-7h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" /><path d="M4 13h4.5l1.5 2.5h4l1.5-2.5H20" /></>,
  heart: <path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" />,
  head: <><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3.5" y="14" width="4" height="6" rx="1.5" /><rect x="16.5" y="14" width="4" height="6" rx="1.5" /></>,
  check: <><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.2l2.4 2.4 4.6-5" /></>,
  x: <path d="M6 6l12 12M18 6 6 18" />,
  wave: <path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 7v10" />,
  tag: <><path d="M3.5 12.5V5a1.5 1.5 0 0 1 1.5-1.5h7.5l8 8-9 9z" /><circle cx="8" cy="8" r="1.3" /></>,
  user: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  folder: <path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5" /></>,
  share: <><path d="M12 15V4M8 8l4-4 4 4" /><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12" /></>,
  grid: <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
  prep: <><rect x="5" y="4.5" width="14" height="16" rx="2.5" /><path d="M9 4.5V3.5h6v1M9 13l2 2 4-4" /></>,
  contacts: <><circle cx="9" cy="9" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 6.5a3 3 0 0 1 0 5.5M17.5 14.5a5.5 5.5 0 0 1 3 4.5" /></>,
  activity: <path d="M3.5 12h4l2.5-6 4 12 2.5-6h4" />,
  send: <path d="M20 4 10 14M20 4l-6 16-4-6-6-4z" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6 18 18M6 18l1.4-1.4M16.6 7.4 18 6" /></>,
  up: <path d="M12 19V5M6 11l6-6 6 6" />,
  down: <path d="M12 5v14M6 13l6 6 6-6" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4 4" /></>,
  filter: <path d="M4 6h16M7 12h10M10 18h4" />,
  plus: <path d="M12 5v14M5 12h14" />,
  dl: <><path d="M12 4v11M7.5 11 12 15.5 16.5 11" /><path d="M5 19.5h14" /></>,
  reply: <><path d="M9 8 4 12.5 9 17" /><path d="M4 12.5h10a6 6 0 0 1 6 6v1" /></>,
  star: <path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z" />,
  lock: <><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="M4 7l8 6 8-6" /></>,
  cal: <><rect x="4" y="5.5" width="16" height="14.5" rx="2.5" /><path d="M8 3.5v4M16 3.5v4M4 10h16" /></>,
  chev: <path d="M9 6l6 6-6 6" />,
  shield: <path d="M12 3.5 19 6v6c0 4.5-3.2 7.5-7 8.5-3.8-1-7-4-7-8.5V6z" />,
  card: <><rect x="3.5" y="6" width="17" height="12" rx="2.5" /><path d="M3.5 10h17" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  music: <><path d="M9 18V5.5l10-2V16" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>,
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "size-[18px]" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={`shrink-0 ${className}`} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {ICONS[name]}
    </svg>
  );
}

/** The one card surface every section sits on. */
export const CARD = "rounded-[18px] border border-line bg-card shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)]";

/** A small rounded label: amber needs attention, green is good news, lime is ours, red is a problem, flat is context. */
export function Chip({ tone = "flat", children }: { tone?: "warn" | "up" | "flat" | "acc" | "down"; children: React.ReactNode }) {
  const tones = {
    warn: "bg-[color-mix(in_oklab,#ffb35a_14%,transparent)] text-[#d98a2b]",
    up: "bg-[color-mix(in_oklab,#9be15d_14%,transparent)] text-[#6aa636]",
    acc: "bg-lime/12 text-lime",
    down: "bg-danger/12 text-danger",
    flat: "bg-ink-4 text-mute",
  };
  return <span className={`inline-flex items-center gap-0.5 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${tones[tone]}`}>{children}</span>;
}

/** The icon box the tiles and section titles share. */
export function IconBox({ name, small }: { name: IconName; small?: boolean }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center border border-line bg-well text-bone ${small ? "size-8 rounded-[10px]" : "size-9 rounded-[11px]"}`}>
      <Icon name={name} className={small ? "size-4" : "size-[18px]"} />
    </span>
  );
}

/** A page's head: a small label (what's going on) over the title, with optional actions on the right. */
export function PageHead({ label, title, children }: { label?: React.ReactNode; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {label && <p className="text-[11.5px] text-mute">{label}</p>}
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-bone">{title}</h1>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

/** A section title with its icon box, and an optional note or action on the right. */
export function SectionHead({ id, icon, title, aside }: { id?: string; icon?: IconName; title: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        {icon && <IconBox name={icon} small />}
        <h2 id={id} className="truncate text-[15px] font-semibold tracking-[-0.015em] text-bone">{title}</h2>
      </div>
      {aside && <div className="shrink-0 text-[11.5px] text-mute">{aside}</div>}
    </div>
  );
}

/** One number with its label: the label says what it counts, the chip its scope or change. */
export function StatTile({ icon, label, value, chip }: { icon: IconName; label: string; value: string; chip?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-line bg-card p-2.5 shadow-[0_10px_28px_-18px_rgba(0,0,0,0.6)]">
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

/** A spec-sheet row: what it is on the left, the value on the right. Use inside a <dl>. */
export function InfoRow({ icon, label, children }: { icon: IconName; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-[11px] border border-line bg-well px-2.5 py-2 text-[12px]">
      <dt className="flex min-w-0 flex-1 items-center gap-2 text-mute">
        <Icon name={icon} className="size-[15px]" />
        {label}
      </dt>
      <dd className="min-w-0 truncate text-right font-semibold text-bone">{children}</dd>
    </div>
  );
}

/** Segmented tabs' track and each tab: the current one is lime on a soft lime fill. */
export const SEG = "inline-flex gap-[3px] rounded-xl border border-line bg-well p-[3px]";
export const segTab = (on: boolean) =>
  `inline-flex min-h-9 items-center justify-center whitespace-nowrap rounded-[9px] px-2.5 text-[12px] ${on ? "bg-lime/12 font-semibold text-lime" : "text-mute hover:text-bone"}`;

/** A cover square with the track's initials, for lists without artwork. */
export function Cover({ text, size = "size-[38px]" }: { text: string; size?: string }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-[10px] bg-[linear-gradient(135deg,#3a4224,#1a1d14)] text-[12px] font-bold text-[#d5ff48] ${size}`}>
      {text}
    </span>
  );
}

/** Two letters for a cover or avatar: the first letters of the first two words. */
export function initials(s: string) {
  const w = s.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  return ((w[0]?.[0] ?? "") + (w[1]?.[0] ?? w[0]?.[1] ?? "")).toUpperCase() || "?";
}
