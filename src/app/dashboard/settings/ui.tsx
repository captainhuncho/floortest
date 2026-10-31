import { Icon } from "@/components/Kit";

/**
 * The settings pages' small parts (owner, 31 Oct: redesign to the Kit look). Server-safe: no hooks, so the server
 * pages and the client forms share them. Field labels are sentence case, small and quiet; nested panels sit in the
 * well colour inside a section's card; every result line says what happened and what to do next.
 */

/** A field's label: small, sentence case, above its input. */
export const FIELD = "block text-[12px] font-semibold text-mute";

/** A field's help line under its input. */
export const HELP = "block text-[11.5px] leading-snug text-faint";

/** A panel inside a section (a step, a confirm, a list): the well surface. */
export const WELL = "rounded-[13px] border border-line bg-well";

/** One row of a list inside a well. */
export const ROW = "flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line px-3 py-2.5 first:border-t-0 sm:px-3.5";

/** Buttons, always a full 44px target. */
export const BTN = "btn-lime btn-sm min-h-11 rounded-[12px] px-4!";
export const BTN_GHOST = "btn-ghost btn-sm min-h-11 rounded-[12px] px-4!";
export const BTN_DANGER = "btn-danger btn-sm min-h-11 rounded-[12px] px-4!";

/**
 * The result of an action, right where it happened: green tick for done, red cross for a problem. `next` is the
 * step to take now, shown under the message. Errors are announced at once (alert); good news politely (status).
 */
export function Notice({ tone, children, next, className = "" }: { tone: "ok" | "error" | "info"; children: React.ReactNode; next?: React.ReactNode; className?: string }) {
  const look = {
    ok: "border-[color-mix(in_oklab,#9be15d_35%,transparent)] bg-[color-mix(in_oklab,#9be15d_8%,transparent)]",
    error: "border-danger/35 bg-danger/[0.07]",
    info: "border-line bg-well",
  }[tone];
  const mark = { ok: "text-[#6aa636]", error: "text-danger", info: "text-mute" }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-[12px] border px-3 py-2.5 text-[12.5px] leading-snug ${look} ${className}`}>
      <span className={`mt-px ${mark}`}>
        <Icon name={tone === "ok" ? "check" : tone === "error" ? "x" : "bell"} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-bone">{children}</span>
        {next && <span className="mt-0.5 block text-mute">{next}</span>}
      </span>
    </div>
  );
}

/** An on/off switch: lime when on. The hit area reaches 44px around the 28px track. */
export function Switch({ on, label, onClick, disabled }: { on: boolean; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative h-7 w-12 shrink-0 rounded-full transition before:absolute before:-inset-2 before:content-[''] disabled:opacity-50 motion-reduce:transition-none ${on ? "bg-lime" : "bg-line-2"}`}
    >
      <span className={`switch-thumb absolute left-1 top-1 h-5 w-5 rounded-full ${on ? "translate-x-5 bg-ink" : "bg-bone"}`} />
    </button>
  );
}

/** A setting's title and its one-line explanation, beside its control. */
export function SettingLine({ title, sub, children }: { title: React.ReactNode; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 basis-60">
        <p className="flex flex-wrap items-center gap-2 text-[13px] font-semibold text-bone">{title}</p>
        {sub && <p className="mt-0.5 text-[12px] leading-snug text-mute">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
