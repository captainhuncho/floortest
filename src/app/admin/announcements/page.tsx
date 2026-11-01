import { requireAdmin } from "@/lib/admin";
import { q } from "@/lib/db";
import { env } from "@/lib/env";
import { audienceWhere, describeAudience, readAudience } from "@/lib/audience";
import { allPlans } from "@/lib/plan-store";
import { publishAnnouncement } from "../actions";
import { AudienceFields } from "../AudienceFields";
import { PageHead } from "../PinParts";

type Past = { id: number; title: string; body: string; href: string; audience: string; emailed: number; created_at: number };

/** Published updates shown before the older ones fold away. */
const SHOWN = 8;

/** Pin 90's left column: the month and weekday stacked small, the day large. */
function DateBlock({ at }: { at: number }) {
  const d = new Date(at);
  return (
    <span className="flex w-[92px] shrink-0 items-start gap-2 leading-none">
      <span className="pt-1 text-right">
        <span className="block text-[17px] font-bold">{d.toLocaleDateString("en-GB", { month: "short" })}</span>
        <span className="mt-1 block text-[12px] opacity-55">{d.toLocaleDateString("en-GB", { weekday: "short" })}</span>
      </span>
      <span className="text-[40px] font-bold tracking-[-0.04em] tnum">{d.getDate()}</span>
    </span>
  );
}

/** Pin 90's day line: a calendar mark, the date, and a hairline running to the edge. */
function DayLine({ at, today }: { at: number; today: boolean }) {
  return (
    <p className="flex items-center gap-3 text-[13.5px] text-mute">
      <svg aria-hidden viewBox="0 0 24 24" className="size-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </svg>
      <span className="whitespace-nowrap">
        {new Date(at).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}
        {today && ", Today"}
      </span>
      <span aria-hidden className="h-px flex-1 bg-line-2" />
    </p>
  );
}

/**
 * Write an update, preview it as it'll appear in the bell and in email, then publish. Laid out like pin 90 (owner,
 * 1 Nov): the draft and the published updates are light cards on a timeline, each with a big date block on the left
 * and a chevron that opens it.
 */
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
  const past = await q.all<Past>("SELECT id, title, body, href, audience, emailed, created_at FROM announcements ORDER BY created_at DESC LIMIT 30");
  const todayKey = new Date().toDateString();
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
        <label className="flex min-h-11 items-end gap-2 pb-3 text-sm">
          <input type="checkbox" name="subscribers" defaultChecked={draft.subscribers} className="accent-lime" />
          Include newsletter subscribers without an account
        </label>
      </div>
    </>
  );
  const card = (p: Past) => (
    <li key={p.id}>
      <details className="group rounded-[22px] bg-bone text-ink">
        <summary className="flex cursor-pointer list-none gap-4 p-5 sm:gap-8 [&::-webkit-details-marker]:hidden">
          <DateBlock at={p.created_at} />
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold">{p.title}</span>
            <span className="mt-1 line-clamp-2 block text-[14px] opacity-70 group-open:line-clamp-none">{p.body}</span>
            <span className="mt-2 block text-[12.5px] opacity-55">
              {p.audience}
              {p.emailed ? " · emailed" : " · bell only"}
            </span>
          </span>
          <svg aria-hidden viewBox="0 0 24 24" className="mt-1 size-5 shrink-0 opacity-70 transition-transform duration-300 group-open:rotate-180" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </summary>
        <div className="border-t border-ink/10 px-5 py-4 text-[13px] sm:pl-[148px]">
          <p className="opacity-70">Link: {p.href ? <span className="font-mono">{p.href}</span> : "none"}</p>
          <p className="mt-1 opacity-70">Published {new Date(p.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
        </div>
      </details>
    </li>
  );
  const days = [...new Set(past.map((p) => new Date(p.created_at).toDateString()))];
  const shownIds = new Set(past.slice(0, SHOWN).map((p) => p.id));

  return (
    <div className="space-y-6">
      <PageHead eyebrow="Growth" title="Announcements">
        Shows in the bell for everyone in the audience. Email only goes to people who turned on product news.
      </PageHead>
      {sp.published && (
        <p role="status" className="rounded-[16px] bg-lime/10 px-4 py-3 text-[14px] ring-1 ring-lime/40">
          Published. Emails go out in the background.
        </p>
      )}

      {/* The draft: pin 90's "Action trigger" card, the left column naming what this card is. */}
      {/* Folds so the timeline (the pin's main part) sits near the top; open when previewing or nothing is published. */}
      <details className="admin-panel admin-rise group" style={{ "--i": 1 } as React.CSSProperties} open={previewing || !past.length}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 text-[15px] font-semibold">
            <span aria-hidden className="grid size-7 place-items-center rounded-full bg-lime text-[16px] leading-none text-ink">
              +
            </span>
            New update
          </span>
          <span aria-hidden className="text-faint transition-transform duration-200 group-open:rotate-180">
            ▾
          </span>
        </summary>
      <section aria-labelledby="new-h" className="flex flex-col gap-5 border-t border-line p-5 sm:flex-row sm:gap-8">
        <h2 id="new-h" className="w-[92px] shrink-0 text-[22px] font-bold leading-[1.1] tracking-[-0.02em]">
          Draft
        </h2>
        <form className="min-w-0 flex-1 space-y-3">
          <input type="hidden" name="preview" value="1" />
          {fields}
          <button className="admin-press inline-flex min-h-11 items-center rounded-full px-5 text-[13.5px] font-semibold ring-1 ring-line-2 hover:bg-ink-3">Preview</button>
        </form>
      </section>
      </details>

      {previewing && (
        <section aria-labelledby="pv-h" className="admin-panel admin-rise flex flex-col gap-5 p-5 ring-1 ring-lime/40 sm:flex-row sm:gap-8" style={{ "--i": 2 } as React.CSSProperties}>
          <h2 id="pv-h" className="w-[92px] shrink-0 text-[22px] font-bold leading-[1.1] tracking-[-0.02em]">
            Preview
          </h2>
          <div className="min-w-0 flex-1 space-y-4">
            <div className="max-w-sm rounded-[16px] bg-ink-3 p-3 ring-1 ring-line">
              <p className="text-[12px] font-bold">{draft.title}</p>
              {draft.body && <p className="mt-1 text-[11px] text-mute">{draft.body}</p>}
            </div>
            {draft.list && (
              <pre className="max-w-xl whitespace-pre-wrap rounded-[12px] bg-ink-3 p-3 text-xs text-mute">
                {`Subject: ${draft.title}\n\n${draft.body}\n\n${draft.href ? `${env.appUrl}${draft.href}` : env.appUrl}`}
              </pre>
            )}
            <p className="text-[14px]">
              {describeAudience(aud, (id) => plans.find((p) => p.id === id)?.name ?? id)}: reaches {reach} account{reach === 1 ? "" : "s"} in the bell
              {draft.list ? `, and emails ${emailReach + subscriberReach}${subscriberReach ? ` (${subscriberReach} without an account)` : ""}` : ""}.
            </p>
            <form action={publishAnnouncement}>
              {Object.entries({ ...draft, ...aud }).map(([k, v]) =>
                k === "subscribers" ? v && <input key={k} type="hidden" name={k} value="on" /> : <input key={k} type="hidden" name={k} value={String(v)} />,
              )}
              <button className="admin-press inline-flex min-h-11 items-center rounded-full bg-lime px-5 text-[13.5px] font-semibold text-ink">Publish</button>
            </form>
          </div>
        </section>
      )}

      <section aria-labelledby="pub-h" className="space-y-4">
        <h2 id="pub-h" className="flex items-center gap-2 text-[15px] font-semibold">
          Published
          <span className="rounded-full bg-ink-4 px-2 text-[11.5px] font-semibold text-mute tnum">{past.length}</span>
        </h2>
        {!past.length && <p className="admin-panel p-6 text-[14px] text-mute">Nothing yet.</p>}
        {days
          .filter((d) => past.some((p) => new Date(p.created_at).toDateString() === d && shownIds.has(p.id)))
          .map((d) => {
            const items = past.filter((p) => new Date(p.created_at).toDateString() === d && shownIds.has(p.id));
            return (
              <div key={d} className="admin-rise space-y-3">
                <DayLine at={items[0].created_at} today={d === todayKey} />
                <ul className="space-y-3">{items.map(card)}</ul>
              </div>
            );
          })}
        {past.length > SHOWN && (
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center text-[13px] text-mute hover:text-bone [&::-webkit-details-marker]:hidden">
              <span className="group-open:hidden">Show {past.length - SHOWN} older updates</span>
              <span className="hidden group-open:inline">Show fewer</span>
            </summary>
            <ul className="mt-3 space-y-3">{past.slice(SHOWN).map(card)}</ul>
          </details>
        )}
      </section>
    </div>
  );
}
