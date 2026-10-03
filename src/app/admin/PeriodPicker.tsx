import Link from "next/link";
import { PERIODS, type Period } from "@/lib/period";

/** Last 30 days / 3 months / 6 months, or a custom date range. Plain links and a GET form, so it works without JavaScript. */
export function PeriodPicker({ path, period }: { path: string; period: Period }) {
  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm ${on ? "border-bone bg-bone font-semibold text-ink" : "border-line text-mute hover:border-mute hover:text-bone"}`;
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Time period">
      {PERIODS.map(([k, label]) => (
        <Link key={k} href={`${path}?p=${k}`} aria-current={period.key === k ? "true" : undefined} className={chip(period.key === k)}>
          {label}
        </Link>
      ))}
      <form action={path} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="p" value="custom" />
        <label className="sr-only" htmlFor="period-from">From</label>
        <input id="period-from" name="from" type="date" required defaultValue={period.fromDate} className="input w-auto py-1.5" />
        <span aria-hidden className="text-mute">–</span>
        <label className="sr-only" htmlFor="period-to">To</label>
        <input id="period-to" name="to" type="date" required defaultValue={period.toDate} className="input w-auto py-1.5" />
        <button className={chip(period.key === "custom")}>Custom</button>
      </form>
    </div>
  );
}
