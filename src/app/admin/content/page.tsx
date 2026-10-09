import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { q } from "@/lib/db";
import { contentRow, SITE_PAGES, type Field, type SitePage } from "@/lib/content";
import { fmtDate } from "@/lib/format";
import { discardDraft, restoreContent, saveContent } from "../actions";
import { ConfirmButton, ImageField } from "../AdminUi";
import { EmailEditor } from "./EmailEditor";

const PAGES = Object.keys(SITE_PAGES) as SitePage[];

/** Edit the words and images on public pages: save a draft, preview it on the real page, then publish. */
export default async function SiteContent({ searchParams }: { searchParams: Promise<{ page?: string; email?: string }> }) {
  await requireAdmin("content");
  const sp = await searchParams;
  const want = sp.page as SitePage;
  const page = PAGES.includes(want) ? want : "home";
  const def = SITE_PAGES[page];
  const row = await contentRow(page);
  const draft = JSON.parse(row?.draft || "{}") as Record<string, string>;
  const unpublished = !!row && row.draft !== row.published;
  const versions = await q.all<{ id: number; created_at: number; handle: string | null }>(
    "SELECT v.id, v.created_at, u.handle FROM site_content_versions v LEFT JOIN users u ON u.id = v.admin_id WHERE v.page = ? ORDER BY v.created_at DESC LIMIT 20",
    page,
  );
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Site content</h1>
        <p className="mt-2 text-mute">
          Change the words and images on public pages. Save a draft, preview it on the real page (only you see drafts), then publish. Plan prices and
          features live in <Link href="/admin/plans" className="underline underline-offset-4">Plans</Link>.
        </p>
      </div>
      <nav aria-label="Pages" className="flex flex-wrap gap-2">
        {PAGES.map((p) => (
          <Link key={p} href={`/admin/content?page=${p}`} aria-current={p === page && sp.page !== "emails" ? "page" : undefined} className={`chip ${p === page && sp.page !== "emails" ? "border-lime/50 text-lime" : "border-line text-mute hover:text-bone"}`}>
            {SITE_PAGES[p].label}
          </Link>
        ))}
        <Link href="/admin/content?page=emails" aria-current={sp.page === "emails" ? "page" : undefined} className={`chip ${sp.page === "emails" ? "border-lime/50 text-lime" : "border-line text-mute hover:text-bone"}`}>
          Emails
        </Link>
      </nav>
      {sp.page === "emails" ? <EmailEditor want={sp.email} /> : (
      <>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className={`chip ${unpublished ? "border-lime/50 text-lime" : "border-line text-mute"}`}>{unpublished ? "Draft not published yet" : "Draft matches the live page"}</span>
        {row?.published_at && <span className="text-mute">Last published {fmtDate(row.published_at)}</span>}
        {/* Opens the real page with editing on: click text to change it, swap images, drag sections. Home has the most. */}
        <a href={`/api/admin/preview?page=${page}`} target="_blank" rel="noreferrer" className="btn-lime btn-sm">
          Edit on the page ↗
        </a>
        {/* The draft view lives on floortest.app, so this can't tell whether it's on: the link is always offered. */}
        <a href="/api/admin/preview?off" className="text-xs text-mute underline underline-offset-4">
          Stop showing drafts on the site
        </a>
      </div>
      <form action={saveContent.bind(null, page)} className="space-y-5 rounded-md border border-line p-5">
        {Object.entries(def.fields as Record<string, Field>).map(([k, fld]) => {
          const value = draft[k] ?? fld.start;
          const hint = [fld.hint, fld.vars?.length && `Fill-ins: ${fld.vars.map((v) => `{${v}}`).join(", ")}`].filter(Boolean).join(" ");
          if (fld.kind === "image") return <ImageField key={k} name={k} label={fld.label} hint={hint} initial={value} />;
          return (
            <label key={k} className="block space-y-1.5">
              <span className="label">{fld.label}</span>
              {fld.kind === "line" ? (
                <input name={k} defaultValue={value} className="input" />
              ) : (
                <textarea name={k} defaultValue={value} rows={fld.kind === "pairs" ? Math.min(18, value.split("\n").length + 1) : 3} className="input" />
              )}
              {hint && <span className="block text-xs text-dim">{hint}</span>}
            </label>
          );
        })}
        <p className="text-xs text-dim">An empty text box goes back to the original wording.</p>
        <div className="flex flex-wrap gap-2">
          <button name="intent" value="draft" className="btn-ghost btn-sm">
            Save draft
          </button>
          <button name="intent" value="publish" className="btn-lime btn-sm">
            Save and publish
          </button>
        </div>
      </form>
      {unpublished && (
        <ConfirmButton action={discardDraft.bind(null, page)} message="Throw away the draft and go back to what's live?" confirmLabel="Discard draft" className="btn-ghost btn-sm">
          Discard draft
        </ConfirmButton>
      )}
      <section aria-labelledby="versions-h" className="space-y-3">
        <h2 id="versions-h" className="text-lg font-semibold">Published versions</h2>
        {versions.length ? (
          <ul className="divide-y divide-line rounded-md border border-line">
            {versions.map((v, i) => (
              <li key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>
                  {fmtDate(v.created_at)}
                  {v.handle && <span className="text-mute"> · @{v.handle}</span>}
                  {i === 0 && <span className="ml-2 chip border-lime/50 text-lime">Live</span>}
                </span>
                {i > 0 && (
                  <ConfirmButton action={restoreContent.bind(null, page, v.id)} message="Copy this version into the draft? Nothing changes on the site until you publish." confirmLabel="Copy to draft" className="btn-ghost btn-sm">
                    Restore
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-mute">Nothing published from here yet: the page shows its original wording.</p>
        )}
      </section>
      </>
      )}
    </div>
  );
}
