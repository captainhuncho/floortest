import { CARD } from "@/components/Kit";

/** One settings card: a title, an optional line under it, then the controls. The danger tone is for deleting things. */
export function Section({ id, title, sub, tone, children }: { id: string; title: string; sub?: React.ReactNode; tone?: "danger"; children: React.ReactNode }) {
  const surface = tone === "danger" ? "rounded-[18px] border border-danger/40 bg-danger/5" : CARD;
  return (
    <section aria-labelledby={id} className={`${surface} p-3 sm:p-4`}>
      <h2 id={id} className={`text-[15px] font-semibold tracking-[-0.015em] ${tone === "danger" ? "text-danger" : "text-bone"}`}>
        {title}
      </h2>
      {sub && <p className="mt-0.5 text-[12px] leading-snug text-mute">{sub}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Settings pages' title: the dashboard's page head (a small label over the title), with an optional line under it. */
export function PageTitle({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return (
    <header className="flex min-w-0 flex-col gap-1">
      <p className="text-[11.5px] text-mute">Settings</p>
      <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.025em] text-bone">{title}</h1>
      {sub && <p className="max-w-[60ch] text-[13px] leading-snug text-mute">{sub}</p>}
    </header>
  );
}
