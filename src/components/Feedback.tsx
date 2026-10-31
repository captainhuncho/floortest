import Link from "next/link";
import { Icon, type IconName } from "./Kit";

/**
 * Feedback on the page itself (owner, 31 Oct: every failure prompt clear and calm). Server-safe, no hooks.
 *
 * - `Notice`: a banner in the page. "info" is context, "done" confirms, "warn" needs a look soon (lime-tinted, the one
 *   light), "error" says what didn't happen and what to do next. Errors are announced at once (role="alert"); the
 *   others politely (role="status").
 * - `FormError`: the line under a form or a field when something was refused. Plain words: what happened, then what to do.
 * - `EmptyState`: one sentence saying what will appear here, and the one action that makes it happen.
 */
type Tone = "info" | "done" | "warn" | "error";

const TONES: Record<Tone, { box: string; icon: IconName; mark: string }> = {
  info: { box: "border-line bg-well", icon: "clock", mark: "text-mute" },
  done: { box: "border-line bg-well", icon: "check", mark: "text-bone" },
  warn: { box: "border-lime/35 bg-lime/[0.07]", icon: "bell", mark: "text-lime" },
  error: { box: "border-danger/40 bg-danger/[0.08]", icon: "x", mark: "text-danger" },
};

export function Notice({
  tone = "info",
  title,
  children,
  action,
  className = "",
}: {
  tone?: Tone;
  title?: React.ReactNode;
  children?: React.ReactNode;
  /** One follow-up, as a link or button the caller renders. */
  action?: React.ReactNode;
  className?: string;
}) {
  const t = TONES[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-[13px] border px-3 py-2.5 text-[12.5px] leading-[1.5] ${t.box} ${className}`}>
      <span aria-hidden className={`mt-px ${t.mark}`}>
        <Icon name={t.icon} className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold text-bone">{title}</p>}
        {children && <div className={title ? "mt-0.5 text-mute" : "text-bone"}>{children}</div>}
        {action && <div className="mt-2 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}

export function FormError({ children, id, className = "" }: { children?: React.ReactNode; id?: string; className?: string }) {
  if (!children) return null;
  return (
    <p id={id} role="alert" className={`flex items-start gap-1.5 text-[12.5px] leading-[1.45] text-danger ${className}`}>
      <svg viewBox="0 0 24 24" aria-hidden className="mt-0.5 size-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5.5M12 16.5h.01" />
      </svg>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

export function EmptyState({
  icon,
  children,
  action,
  className = "",
}: {
  icon?: IconName;
  children: React.ReactNode;
  /** The one thing to do about it. */
  action?: { href: string; label: string };
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-start gap-3 py-4 ${className}`}>
      <div className="flex items-start gap-2.5">
        {icon && (
          <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-[10px] border border-line bg-well text-mute">
            <Icon name={icon} className="size-4" />
          </span>
        )}
        <p className={`max-w-prose text-[13px] leading-[1.5] text-mute ${icon ? "pt-1.5" : ""}`}>{children}</p>
      </div>
      {action && (
        <Link href={action.href} className={`inline-flex min-h-9 items-center rounded-[10px] border border-line bg-well px-3 text-[12px] font-semibold text-bone hover:border-line-2 pointer-coarse:min-h-11 ${icon ? "ml-[2.625rem]" : ""}`}>
          {action.label}
        </Link>
      )}
    </div>
  );
}
