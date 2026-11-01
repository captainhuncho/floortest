import type { ReactNode } from "react";

/**
 * Small pieces taken from the owner's Pinterest pins (1 Nov), shared by the ops screens so the same thing looks the
 * same everywhere: pin 96's log time and level labels and its big mono stat card, pin 107's status pills and avatars,
 * and pin 89's step tracker. Server-safe: no hooks, no client code.
 */

export type Tone = "lime" | "violet" | "danger" | "amber" | "mute";

const RING: Record<Tone, string> = {
  lime: "bg-lime/12 text-lime ring-lime/35",
  violet: "bg-[var(--admin-violet)]/14 text-[var(--admin-violet)] ring-[var(--admin-violet)]/40",
  danger: "bg-danger/12 text-danger ring-danger/40",
  amber: "bg-[var(--admin-amber)]/12 text-[var(--admin-amber)] ring-[var(--admin-amber)]/40",
  mute: "bg-ink-4 text-mute ring-line-2",
};
const DOT: Record<Tone, string> = {
  lime: "bg-lime",
  violet: "bg-[var(--admin-violet)]",
  danger: "bg-danger",
  amber: "bg-[var(--admin-amber)]",
  mute: "bg-faint",
};
const FILL: Record<Tone, string> = { ...DOT, mute: "bg-ink-4" };

/** Eyebrow, title and one line under it: the head every rebuilt screen starts with. */
export function PageHead({ eyebrow, title, children, aside }: { eyebrow: string; title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <header className="admin-rise flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <span className="rounded-full px-3 py-1 text-[10.5px] font-semibold uppercase tracking-[0.2em] text-bone ring-1 ring-line-2">{eyebrow}</span>
        <h1 className="mt-3 text-[34px] font-semibold leading-tight tracking-[-0.03em]">{title}</h1>
        {children && <p className="mt-1 max-w-2xl text-[15px] text-mute">{children}</p>}
      </div>
      {aside}
    </header>
  );
}

/** Pin 96's INFO / DEBUG / ERROR label: a mono word in a tinted, outlined box with a small mark in front. */
export function LevelPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-2 py-[3px] font-mono text-[11px] font-semibold uppercase tracking-[0.06em] ring-1 ${RING[tone]}`}>
      <span aria-hidden className={`size-1.5 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}

/** Pin 107's status pill: a soft fill, a dot and one word. */
export function StatusPill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold ${RING[tone]} ring-0`}>
      <span aria-hidden className={`size-1.5 rounded-full ${DOT[tone]}`} />
      {children}
    </span>
  );
}

const AVATAR = ["#d5ff48", "#c9c1ff", "#f7b6a8", "#ffd98a", "#a8e6cf"];

/** Initials in a coloured circle, the same colour for the same name every time (pin 107's avatars). */
export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .replace(/^@/, "")
    .split(/[\s._-]+/)
    .filter((w) => /\p{L}/u.test(w[0] ?? ""))
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const hue = AVATAR[[...name].reduce((s, c) => s + c.charCodeAt(0), 0) % AVATAR.length];
  return (
    <span aria-hidden className="grid shrink-0 place-items-center rounded-full font-bold text-ink" style={{ width: size, height: size, background: hue, fontSize: size * 0.38 }}>
      {initials || "?"}
    </span>
  );
}

/** Pin 96's time column: the date small, the time large in mono, the record number underneath. */
export function LogTime({ at, id }: { at: number; id?: number }) {
  const d = new Date(at);
  return (
    <span className="block leading-tight">
      <span className="block whitespace-nowrap font-mono text-[11.5px] text-faint">{d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</span>
      <span className="block font-mono text-[14px] font-semibold text-bone tnum">{d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
      {id !== undefined && <span className="block font-mono text-[10.5px] text-faint">#{id}</span>}
    </span>
  );
}

/**
 * Pin 89's tracker: ticked circles joined by bars, the next step as an empty ring, a status line under it and
 * "2 of 3" on the right. `failed` turns the last finished step red (a rejected claim, a request sent back).
 */
export function Stepper({ steps, done, status, failed }: { steps: string[]; done: number; status: string; failed?: boolean }) {
  return (
    <div>
      <ol className="flex items-center" aria-label={`${status}: step ${Math.min(done, steps.length)} of ${steps.length}`}>
        {steps.map((s, i) => {
          const isDone = i < done;
          const bad = failed && i === done - 1;
          return (
            <li key={s} className={`flex items-center ${i ? "flex-1" : ""}`}>
              {i > 0 && (
                <span aria-hidden className="mx-2 h-1.5 flex-1 overflow-hidden rounded-full bg-ink-4">
                  <span
                    className={`admin-grow block h-full rounded-full ${i < done ? (bad ? "bg-danger" : "bg-lime") : i === done ? "w-1/3 bg-lime/50" : "w-0"}`}
                    style={{ "--i": i } as React.CSSProperties}
                  />
                </span>
              )}
              <span title={s} className={`grid size-9 shrink-0 place-items-center rounded-full text-[14px] font-bold ${isDone ? (bad ? "bg-danger text-ink" : "bg-lime text-ink") : "ring-2 ring-line-2"}`}>
                <span aria-hidden>{isDone ? (bad ? "✕" : "✓") : ""}</span>
                <span className="sr-only">{`${s}${isDone ? " done" : ""}`}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2.5 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-mute">{status}</span>
        <span className="shrink-0 text-faint tnum">
          {Math.min(done, steps.length)} of {steps.length}
        </span>
      </p>
    </div>
  );
}

/** Pin 96's "Call duration" card: a label, a big mono figure, a bar under it and a short caption (plus optional notes under it). */
export function MonoStat({ label, value, caption, pct, tone = "lime", i = 0, children }: { label: string; value: string; caption: string; pct?: number; tone?: Tone; i?: number; children?: ReactNode }) {
  return (
    <div className="admin-panel admin-rise p-5" style={{ "--i": i } as React.CSSProperties}>
      <p className="text-[13px] font-medium text-mute">{label}</p>
      <p className="mt-2 font-mono text-[28px] font-semibold leading-none tracking-[-0.02em] tnum">{value}</p>
      {pct !== undefined && (
        <span className="mt-4 block h-2 overflow-hidden rounded-full bg-ink-4" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)} aria-label={label}>
          <span className={`admin-grow block h-full rounded-full ${FILL[tone]}`} style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%`, "--i": i } as React.CSSProperties} />
        </span>
      )}
      <p className="mt-2.5 font-mono text-[11.5px] text-faint">{caption}</p>
      {children}
    </div>
  );
}
