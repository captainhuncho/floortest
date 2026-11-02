import Link from "next/link";
import { can } from "@/lib/admin";
import type { OpsAccess } from "@/lib/ops-access";
import { ACTIVITY, JOINED, readAudience } from "@/lib/audience";
import { ADMIN_PLANS, PAGE_SIZE, readPage, readSecurity, SECURITY } from "@/lib/admin-bulk";
import { allPlans } from "@/lib/plan-store";
import { KIND_LABEL, now } from "@/lib/db";
import { AudienceFields } from "../../AudienceFields";
import { crmRows } from "./data";
import { editableFor, pageList, readLayout, readView, usersHref, VIEW_KEYS, VIEWS } from "./model";
import { UsersView } from "./UsersView";
import "./crm.css";

/**
 * Users with the new look (admin redesign B, step 5; switch `ops_shell`), read on the server: saved views from
 * `?view=`, today's filters, search, paging and CSV, then the rows for the browser part (UsersView) to show and edit.
 */
export async function CrmUsers({ sp, access }: { sp: Record<string, string | undefined>; access: OpsAccess }) {
  const search = (sp.q || "").trim().slice(0, 100);
  const aud = readAudience((k) => sp[k]);
  const security = readSecurity(sp.security);
  const page = readPage(sp.page);
  const view = readView(sp.view);
  const layout = readLayout(sp.layout);
  const edit = editableFor({ super: access.super, perms: access.perms });
  const [plans, data] = await Promise.all([allPlans(), crmRows({ aud, security, search, view, page, at: now(), showEmail: can(access, "users.read") })]);
  const params: Record<string, string> = { ...aud, joined: aud.joined ? String(aud.joined) : "", security, q: search, view, layout };
  const link = (change: Record<string, string>) => usersHref(params, change);
  const planName = (id: string) => plans.find((p) => p.id === id)?.name ?? id;
  const planOptions = ADMIN_PLANS.map((p) => ({ value: p, label: planName(p) }));
  const { total, rows, counts } = data;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const first = (page - 1) * PAGE_SIZE + 1;
  const csv = new URLSearchParams(Object.entries({ ...aud, joined: params.joined, security, q: search }).filter(([, v]) => v) as [string, string][]).toString();
  const chips = [
    aud.kind && { label: "Type", value: KIND_LABEL[aud.kind], off: link({ kind: "", page: "" }) },
    aud.plan && { label: "Plan", value: planName(aud.plan), off: link({ plan: "", page: "" }) },
    aud.tag && { label: "Tag", value: aud.tag, off: link({ tag: "", page: "" }) },
    aud.joined && { label: "Joined", value: JOINED[aud.joined], off: link({ joined: "", page: "" }) },
    aud.activity && { label: "Activity", value: ACTIVITY[aud.activity], off: link({ activity: "", page: "" }) },
    security && { label: "Security", value: SECURITY[security], off: link({ security: "", page: "" }) },
  ].filter(Boolean) as { label: string; value: string; off: string }[];

  const toolbar = (
    <>
      <form className="ou-search" role="search">
        {Object.entries(params).map(([k, v]) => k !== "q" && v && <input key={k} type="hidden" name={k} value={v} />)}
        <input name="q" defaultValue={search} placeholder="Name, email or link" className="input" aria-label="Search accounts" />
        <button className="btn-ghost btn-sm">Search</button>
      </form>
      <details className="ou-filters">
        <summary className="btn-ghost btn-sm flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
          Filters
          {chips.length > 0 && <span className="rounded bg-lime px-1.5 text-[11px] font-bold text-ink tnum">{chips.length}</span>}
        </summary>
        <form className="ou-filter-panel">
          {Object.entries(params).map(([k, v]) => ["q", "view", "layout"].includes(k) && v && <input key={k} type="hidden" name={k} value={v} />)}
          <AudienceFields a={aud} plans={plans} />
          <label className="block max-w-xs space-y-1.5">
            <span className="label">Security</span>
            <select name="security" defaultValue={security} className="input">
              {Object.entries(SECURITY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <div className="flex justify-end gap-2">
            <Link href={link({ kind: "", plan: "", tag: "", joined: "", activity: "", security: "", page: "" })} className="btn-ghost btn-sm">
              Clear all
            </Link>
            <button className="btn-lime btn-sm">Show results</button>
          </div>
        </form>
      </details>
      {chips.map((c) => (
        <Link key={c.label} href={c.off} className="chip min-h-8 gap-1.5 border-line-2 text-bone hover:border-field" aria-label={`Remove filter ${c.label}: ${c.value}`}>
          <span className="text-mute">{c.label}</span> {c.value} <span aria-hidden>✕</span>
        </Link>
      ))}
      <span className="ou-count tnum">
        {total.toLocaleString("en-GB")} {total === 1 ? "account" : "accounts"}
      </span>
    </>
  );

  return (
    <div className="ou">
      <div className="ou-head">
        <div className="min-w-0">
          <h1 className="text-[26px] font-bold tracking-[-0.02em]">Users</h1>
          <p className="mt-1 text-[13px] text-mute">
            <span className="ou-wide">Every account. Click a tag, note{edit.plan ? ", plan" : ""} or status to change it in place.</span>
            <span className="ou-narrow">Every account. Tap someone to see and change their details.</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link href="/admin/accounts?view=senders" className="btn-ghost btn-sm">
            Senders
          </Link>
          {edit.csv && (
            <a href={`/api/admin/users-csv${csv ? `?${csv}` : ""}`} className="btn-ghost btn-sm">
              Export CSV
            </a>
          )}
        </div>
      </div>
      <nav className="ou-views" aria-label="Saved views">
        {VIEW_KEYS.map((k) => (
          <Link key={k} href={link({ view: k, page: "" })} aria-current={k === view ? "page" : undefined} className="ou-viewtab">
            {VIEWS[k].label}
            <span className="ou-viewn tnum">{counts[k].toLocaleString("en-GB")}</span>
          </Link>
        ))}
      </nav>
      {/* Keyed on the address: another view, filter or page starts with nothing selected and the drawer closed. */}
      <UsersView key={link({ layout: "" })} rows={rows} edit={edit} plans={planOptions} layout={layout} toolbar={toolbar} />
      {total > 0 && (
        <nav aria-label="Pages" className="ou-pages">
          <span className="tnum">
            {first.toLocaleString("en-GB")}–{Math.min(total, page * PAGE_SIZE).toLocaleString("en-GB")} of {total.toLocaleString("en-GB")}
          </span>
          {pages > 1 && (
            <span className="ml-auto flex flex-wrap gap-1">
              {page > 1 && (
                <Link href={link({ page: String(page - 1) })} className="ou-pg" aria-label="Previous page">
                  ‹
                </Link>
              )}
              {pageList(page, pages).map((p, i) =>
                p === 0 ? (
                  <span key={`gap${i}`} className="ou-pg" aria-hidden>
                    …
                  </span>
                ) : (
                  <Link key={p} href={link({ page: String(p) })} aria-current={p === page ? "page" : undefined} className="ou-pg tnum">
                    {p}
                  </Link>
                ),
              )}
              {page < pages && (
                <Link href={link({ page: String(page + 1) })} className="ou-pg" aria-label="Next page">
                  ›
                </Link>
              )}
            </span>
          )}
        </nav>
      )}
    </div>
  );
}
