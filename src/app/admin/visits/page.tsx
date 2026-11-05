import { requireAdmin } from "@/lib/admin";
import { now, q } from "@/lib/db";

export const metadata = { title: "Visits — FloorTest admin" };

const DAY = 86_400_000;
const PERIODS = [7, 30, 90] as const;
const countryName = (() => {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  return (c: string) => {
    if (!c) return "Unknown";
    try {
      return names.of(c) ?? c;
    } catch {
      return c;
    }
  };
})();

type Row = { label: string; n: number };

function Table({ id, title, what, by, rows, empty }: { id: string; title: string; what: string; by: string; rows: Row[]; empty: string }) {
  return (
    <section aria-labelledby={`${id}-h`} className="space-y-3">
      <div>
        <h2 id={`${id}-h`} className="text-lg font-semibold">
          {title}
        </h2>
        <p className="text-sm text-mute">{what}</p>
      </div>
      <div className="overflow-x-auto rounded-md border border-line">
        <table className="w-full text-sm">
          <thead className="text-left text-mute">
            <tr>
              <th className="px-3 py-2 font-medium">{by}</th>
              <th className="px-3 py-2 text-right font-medium">Count</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="px-3 py-2 break-all">{r.label}</td>
                <td className="px-3 py-2 text-right tnum">{r.n.toLocaleString("en")}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-mute">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Where traffic comes from, from the in-house counter (/api/visit): counts per day, never a person, an IP or a cookie. */
export default async function Visits({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAdmin("metrics");
  const asked = Number((await searchParams).days);
  const days = PERIODS.find((p) => p === asked) ?? 30;
  const since = new Date(now() - (days - 1) * DAY).toISOString().slice(0, 10);
  const sum = (col: string, kind: "visit" | "view", limit = 20) =>
    q.all<{ label: string; n: number }>(
      `SELECT ${col} AS label, SUM(n)::int AS n FROM visit_counts WHERE day >= ? AND kind = ? GROUP BY ${col} ORDER BY n DESC, label LIMIT ${limit}`,
      since,
      kind,
    );
  const [totals, perDay, pages, sources, countries, devices, links] = await Promise.all([
    q.all<{ kind: string; n: number }>("SELECT kind, SUM(n)::int AS n FROM visit_counts WHERE day >= ? GROUP BY kind", since),
    q.all<{ day: string; visits: number; views: number }>(
      `SELECT day, SUM(CASE WHEN kind = 'visit' THEN n ELSE 0 END)::int AS visits, SUM(CASE WHEN kind = 'view' THEN n ELSE 0 END)::int AS views
       FROM visit_counts WHERE day >= ? GROUP BY day ORDER BY day DESC`,
      since,
    ),
    sum("page", "view"),
    sum("source", "visit"),
    sum("country", "visit"),
    sum("device", "visit", 5),
    q.all<{ label: string; n: number }>(
      `SELECT u.handle AS label, SUM(v.n)::int AS n FROM visit_counts v JOIN users u ON u.id = v.link_owner
       WHERE v.day >= ? GROUP BY u.handle ORDER BY n DESC, u.handle LIMIT 25`,
      since,
    ),
  ]);
  const total = (k: string) => totals.find((t) => t.kind === k)?.n ?? 0;
  const empty = "Nothing counted yet.";

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Visits</h1>
        <p className="mt-2 max-w-2xl text-mute">
          Where FloorTest&apos;s traffic comes from, counted on our own server for every visitor, with or without the cookie banner. Only daily counts
          are kept: no IP address, cookie, account or visitor id. A visit is the first page someone opens; a view is every page after that. Bots are left
          out. Counts are kept 400 days.
        </p>
      </div>
      <nav aria-label="Period" className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <a key={p} href={`/admin/visits?days=${p}`} aria-current={days === p ? "page" : undefined} className={`chip ${days === p ? "border-lime/60 text-lime" : "border-line text-mute"}`}>
            Last {p} days
          </a>
        ))}
      </nav>

      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["Visits", total("visit")],
          ["Page views", total("view") + total("visit")],
        ].map(([label, n]) => (
          <div key={label} className="rounded-md border border-line p-4">
            <p className="label">{label}</p>
            <p className="mt-1 text-2xl font-bold tnum">{Number(n).toLocaleString("en")}</p>
          </div>
        ))}
      </div>

      <Table id="links" title="Receiving links" what="Visits and views of each receiver's own link (floortest.com/handle)." by="Link" rows={links.map((r) => ({ label: `/${r.label}`, n: r.n }))} empty={empty} />
      <Table id="sources" title="Where visits come from" what="The site a visitor came from, or the link's utm_source. Direct means typed, bookmarked, or from an app that hides it." by="Source" rows={sources.map((r) => ({ label: r.label || "Direct", n: r.n }))} empty={empty} />
      <Table id="countries" title="Countries" what="From the visitor's connection, as our host reports it. Only the country is kept." by="Country" rows={countries.map((r) => ({ label: countryName(r.label), n: r.n }))} empty={empty} />
      <Table id="pages" title="Pages after the first" what="Pages people moved on to. Private links show as :token, receivers' links as /:link." by="Page" rows={pages} empty={empty} />
      <Table id="devices" title="Devices" what="Phone, tablet or computer, for visits." by="Device" rows={devices.map((r) => ({ label: r.label || "Unknown", n: r.n }))} empty={empty} />
      <Table id="days" title="By day" what="Visits, then page views, newest first." by="Day" rows={perDay.map((d) => ({ label: `${d.day} · ${d.visits.toLocaleString("en")} visits`, n: d.visits + d.views }))} empty={empty} />
    </div>
  );
}
