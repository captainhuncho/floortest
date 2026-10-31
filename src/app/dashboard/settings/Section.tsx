import { CARD, IconBox, type IconName } from "@/components/Kit";

/**
 * One settings card: an icon box and title, an optional line under it, then the controls with room to breathe.
 * The danger tone is for deleting things: a red edge, no lime.
 */
export function Section({ id, title, sub, tone, icon, children }: { id: string; title: string; sub?: React.ReactNode; tone?: "danger"; icon?: IconName; children: React.ReactNode }) {
  const surface = tone === "danger" ? "rounded-[18px] border border-danger/35 bg-danger/[0.04]" : CARD;
  return (
    <section aria-labelledby={id} className={`${surface} p-4 sm:p-5`}>
      <div className="flex items-start gap-2.5">
        {icon && <IconBox name={icon} small />}
        <div className="min-w-0 flex-1 pt-px">
          <h2 id={id} className={`text-[15px] font-semibold leading-snug tracking-[-0.015em] ${tone === "danger" ? "text-danger" : "text-bone"}`}>
            {title}
          </h2>
          {sub && <p className="mt-0.5 max-w-[62ch] text-[12px] leading-snug text-mute">{sub}</p>}
        </div>
      </div>
      <div className="mt-4 sm:mt-5">{children}</div>
    </section>
  );
}

/** Settings pages' title: the dashboard's page head (a small label over the title), with an optional line under it. */
export function PageTitle({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <header className="flex min-w-0 flex-col gap-1 pb-1">
      <p className="text-[11.5px] text-mute">Settings</p>
      <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-bone">{title}</h1>
      {sub && <p className="max-w-[60ch] text-[13px] leading-snug text-mute">{sub}</p>}
    </header>
  );
}
