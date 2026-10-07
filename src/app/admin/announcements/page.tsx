import { requireAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { env } from "@/lib/env";
import { audienceWhere, describeAudience, readAudience } from "@/lib/audience";
import { allPlans } from "@/lib/plan-store";
import { publishAnnouncement } from "../actions";
import { AudienceFields } from "../AudienceFields";

/** Write an update, preview it as it'll appear in the bell and in email, then publish. */
export default async function Announcements({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireAdmin("announcements");
  const sp = await searchParams;
  const draft = { title: (sp.title || "").slice(0, 100), body: (sp.body || "").slice(0, 600), href: (sp.href || "").slice(0, 200), list: sp.list === "marketing" ? "marketing" : sp.list === "product" ? "product" : "", subscribers: sp.subscribers === "on" };
  const aud = readAudience((k) => sp[k]);
  const plans = await allPlans();
  const w = audienceWhere(aud);
  const previewing = sp.preview === "1" && !!draft.title;
  const reach = await q.count(`SELECT COUNT(*) AS n FROM users u WHERE ${w.sql}`, ...w.args);
  const consent = draft.list === "marketing" ? "u.notify_marketing = 1" : "u.notify_product = 1";
  const emailReach = draft.list ? await q.count(`SELECT COUNT(*) AS n FROM users u WHERE ${w.sql} AND ${consent} AND u.email_verified_at IS NOT NULL`, ...w.args) : 0;
  const subscriberReach = draft.list && draft.subscribers
    ? await q.count(`SELECT COUNT(*) AS n FROM newsletter_subscribers s WHERE s.confirmed_at IS NOT NULL AND s.unsubscribed_at IS NULL ${draft.list === "marketing" ? "AND s.marketing = 1" : ""} AND NOT EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = s.email)`)
    : 0;
  const past = await q.all<{ id: number; title: string; audience: string; emailed: number; created_at: number }>(
    "SELECT id, title, audience, emailed, created_at FROM announcements ORDER BY created_at DESC LIMIT 30",
  );
  const fields = (
    <>
      <label className="block space-y-1.5">
        <span className="label">Title</span>
        <input name="title" required maxLength={100} defaultValue={draft.title} className="input" placeholder="New: export crates to Rekordbox" />
      </label>
      <label className="block space-y-1.5">
        <span className="label">Message</span>
        <textarea name="body" rows={3} maxLength={600} defaultValue={draft.body} className="input resize-y" />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="label">Link inside FloorTest (optional)</span>
          <input name="href" defaultValue={draft.href} pattern="/.*" className="input" placeholder="/dashboard/prepare" />
        </label>
      </div>
      <fieldset className="space-y-2">
        <legend className="label mb-1.5">Who sees it</legend>
        <AudienceFields a={aud} plans={plans} />
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="label">Email it too?</span>
          <select name="list" defaultValue={draft.list} className="input">
            <option value="">No, bell only</option>
            <option value="product">Yes, to newsletter subscribers</option>
            <option value="marketing">Yes, as an offer, to people who accepted offers and promotions</option>
          </select>
        </label>
        <label className="flex items-end gap-2 pb-3 text-sm">
          <input type="checkbox" name="subscribers" defaultChecked={draft.subscribers} className="accent-lime" />
          Include newsletter subscribers without an account
        </label>
      </div>
    </>
  );
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Announcements</h1>
        <p className="mt-2 text-mute">Shows in the bell for everyone in the audience. Email only goes to people who turned on product news.</p>
      </div>
      {sp.published && <p role="status" className="rounded-md border border-lime/40 bg-lime/5 px-4 py-3 text-sm">Published. Emails go out in the background.</p>}

      <form className="space-y-3 rounded-md border border-line p-5">
        <input type="hidden" name="preview" value="1" />
        {fields}
        <button className="btn-ghost btn-sm">Preview</button>
      </form>

      {previewing && (
        <section aria-labelledby="pv-h" className="space-y-4 rounded-md border border-lime/40 p-5">
          <h2 id="pv-h" className="text-lg font-semibold">Preview</h2>
          <div className="max-w-sm rounded-xl border border-line bg-ink-2 p-3">
            <p className="text-[12px] font-bold">{draft.title}</p>
            {draft.body && <p className="mt-1 text-[11px] text-mute">{draft.body}</p>}
          </div>
          {draft.list && (
            <pre className="max-w-xl whitespace-pre-wrap rounded-md border border-line bg-ink-2 p-3 text-xs text-mute">
              {`Subject: ${draft.title}\n\n${draft.body}\n\n${draft.href ? `${env.appUrl}${draft.href}` : env.appUrl}`}
            </pre>
          )}
          <p className="text-sm">
            {describeAudience(aud, (id) => plans.find((p) => p.id === id)?.name ?? id)}: reaches {reach} account{reach === 1 ? "" : "s"} in the bell{draft.list ? `, and emails ${emailReach + subscriberReach}${subscriberReach ? ` (${subscriberReach} without an account)` : ""}` : ""}.
          </p>
          <form action={publishAnnouncement}>
            {Object.entries({ ...draft, ...aud }).map(([k, v]) =>
              k === "subscribers" ? v && <input key={k} type="hidden" name={k} value="on" /> : <input key={k} type="hidden" name={k} value={String(v)} />,
            )}
            <button className="btn-lime btn-sm">Publish</button>
          </form>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Published</h2>
        {!past.length && <p className="text-mute">Nothing yet.</p>}
        <ul className="divide-y divide-line rounded-md border border-line">
          {past.map((p) => (
            <li key={p.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm">
              <span>{p.title}</span>
              <span className="text-mute">{p.audience}{p.emailed ? " · emailed" : ""} · {new Date(p.created_at).toLocaleDateString("en-GB")}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
