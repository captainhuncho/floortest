import { q } from "@/lib/db";
import { EMAILS, emailKey, emailTemplate, fillEmail, SAMPLE_VARS, type EmailDef, type EmailId } from "@/lib/email-copy";
import { fmtDate } from "@/lib/format";
import Link from "next/link";
import { discardDraft, restoreContent, saveEmail, sendTestEmail } from "../actions";
import { ConfirmButton } from "../AdminUi";

const IDS = Object.keys(EMAILS) as EmailId[];

/** Admin → Site content → Emails: edit an email's subject and text, preview it with example details, send a test. */
export async function EmailEditor({ want }: { want?: string }) {
  const id = IDS.includes(want as EmailId) ? (want as EmailId) : IDS[0];
  const def = EMAILS[id];
  const key = emailKey(id);
  const draft = await emailTemplate(id, "draft");
  const row = await q.get<{ draft: string; published: string; published_at: number | null }>("SELECT draft, published, published_at FROM site_content WHERE page = ?", key);
  const unpublished = !!row && row.draft !== row.published;
  const versions = await q.all<{ id: number; created_at: number; handle: string | null }>(
    "SELECT v.id, v.created_at, u.handle FROM site_content_versions v LEFT JOIN users u ON u.id = v.admin_id WHERE v.page = ? ORDER BY v.created_at DESC LIMIT 20",
    key,
  );
  return (
    <div className="space-y-6">
      <nav aria-label="Emails" className="flex flex-wrap gap-2">
        {IDS.map((e) => (
          <Link key={e} href={`/admin/content?page=emails&email=${e}`} aria-current={e === id ? "page" : undefined} className={`chip ${e === id ? "border-lime/50 text-lime" : "border-line text-mute hover:text-bone"}`}>
            {EMAILS[e].label}
          </Link>
        ))}
      </nav>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-mute">Goes to: {def.to}</span>
        <span className={`chip ${unpublished ? "border-lime/50 text-lime" : "border-line text-mute"}`}>{unpublished ? "Draft not published yet" : "Draft matches what's sent"}</span>
        {row?.published_at && <span className="text-mute">Last published {fmtDate(row.published_at)}</span>}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <form action={saveEmail.bind(null, id)} className="space-y-4 rounded-md border border-line p-5">
          <label className="block space-y-1.5">
            <span className="label">Subject</span>
            <input name="subject" defaultValue={draft.subject} className="input" />
          </label>
          <label className="block space-y-1.5">
            <span className="label">Text</span>
            <textarea name="body" defaultValue={draft.body} rows={Math.min(22, draft.body.split("\n").length + 2)} className="input font-mono text-[13px]" />
          </label>
          <div className="text-xs text-dim">
            <p className="mb-1 font-bold text-mute">Fill-ins</p>
            <ul className="space-y-0.5">
              {Object.entries(def.vars).map(([k, v]) => (
                <li key={k}>
                  <code className="text-bone">{`{${k}}`}</code> {v}
                </li>
              ))}
            </ul>
            <p className="mt-2">Plain text only. An empty box goes back to the original wording.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button name="intent" value="draft" className="btn-ghost btn-sm">
              Save draft
            </button>
            <button name="intent" value="publish" className="btn-lime btn-sm">
              Save and publish
            </button>
          </div>
        </form>
        <section aria-labelledby="email-preview-h" className="space-y-3">
          <h2 id="email-preview-h" className="text-lg font-semibold">Preview of the saved draft</h2>
          <div className="rounded-md border border-line bg-ink-2 p-5">
            <p className="text-xs text-mute">Subject</p>
            {/* Same tidying and footer as the real send (emailText in email-copy.ts, sendMail in mail.ts). */}
            <p className="font-bold">{fillEmail(draft.subject, SAMPLE_VARS).replace(/\s+/g, " ")}</p>
            <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed">
              {fillEmail(draft.body, SAMPLE_VARS)}
              {(EMAILS[id] as EmailDef).unsubscribe && "\n\n—\nStop these emails: (each person's own one-click link)"}
            </pre>
          </div>
          <div className="flex flex-wrap gap-2">
            <ConfirmButton action={sendTestEmail.bind(null, id)} message="Send this draft, with example details, to your own email?" confirmLabel="Send test" className="btn-ghost btn-sm">
              Send me a test
            </ConfirmButton>
            {unpublished && (
              <ConfirmButton action={discardDraft.bind(null, key)} message="Throw away the draft and go back to what's sent now?" confirmLabel="Discard draft" className="btn-ghost btn-sm">
                Discard draft
              </ConfirmButton>
            )}
          </div>
        </section>
      </div>
      <section aria-labelledby="email-versions-h" className="space-y-3">
        <h2 id="email-versions-h" className="text-lg font-semibold">Published versions</h2>
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
                  <ConfirmButton action={restoreContent.bind(null, key, v.id)} message="Copy this version into the draft? Nothing changes until you publish." confirmLabel="Copy to draft" className="btn-ghost btn-sm">
                    Restore
                  </ConfirmButton>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-mute">Nothing published from here yet: the original wording is sent.</p>
        )}
      </section>
    </div>
  );
}
