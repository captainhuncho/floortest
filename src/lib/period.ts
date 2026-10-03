const DAY = 86_400_000;

export const PERIODS = [
  ["30d", "Last 30 days", 30],
  ["3m", "Last 3 months", 91],
  ["6m", "Last 6 months", 182],
] as const;

export type Period = { key: string; label: string; from: number; to: number; fromDate: string; toDate: string };

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const nice = (t: number) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const day = (s: string | undefined) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? Date.parse(`${s}T00:00:00Z`) : NaN);

/** Reads ?p=30d|3m|6m|custom (&from=YYYY-MM-DD&to=YYYY-MM-DD) into a time window. Custom dates are whole UTC days, inclusive. */
export function parsePeriod(sp: { p?: string; from?: string; to?: string }, now = Date.now()): Period {
  if (sp.p === "custom") {
    const a = day(sp.from);
    const b = day(sp.to);
    if (Number.isFinite(a) && Number.isFinite(b) && a <= b) {
      const to = Math.min(b + DAY, now);
      return { key: "custom", label: `${nice(a)} – ${nice(b)}`, from: a, to, fromDate: sp.from!, toDate: sp.to! };
    }
  }
  const [key, label, days] = PERIODS.find(([k]) => k === sp.p) ?? PERIODS[0];
  return { key, label, from: now - days * DAY, to: now, fromDate: iso(now - days * DAY), toDate: iso(now) };
}
