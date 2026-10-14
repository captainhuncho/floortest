import { PageTitle as SharedPageTitle } from "@/components/PageTitle";

/** One settings card: a title, an optional line under it, then the controls. */
export function Section({ id, title, sub, tone, children }: { id: string; title: string; sub?: React.ReactNode; tone?: "danger"; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={`rounded-xl border p-5 sm:p-6 ${tone === "danger" ? "border-danger/40 bg-danger/5" : "border-line bg-ink-2"}`}>
      <h2 id={id} className={`text-base font-semibold ${tone === "danger" ? "text-danger" : ""}`}>
        {title}
      </h2>
      {sub && <p className="mt-1 text-sm text-mute">{sub}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Settings pages' title: the shared PageTitle (one title size across the dashboard). */
export function PageTitle({ title, sub }: { title: string; sub?: React.ReactNode }) {
  return <SharedPageTitle sub={sub}>{title}</SharedPageTitle>;
}
