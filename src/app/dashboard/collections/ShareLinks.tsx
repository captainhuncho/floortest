"use client";

import { useActionState, useState, useTransition } from "react";
import { CARD, SectionHead } from "@/components/Kit";
import { useToast } from "@/components/Toast";
import { DANGER, FIELD_LABEL, GHOST, GHOST_ON_WELL, LIME, LIME_SM } from "../kitButtons";
import { fmtDate } from "@/lib/format";
import {
  addLinkRecipients,
  answerLinkRequest,
  createShareLink,
  removeLinkRecipient,
  resetShareLink,
  revokeShareLink,
  setLinkRequests,
  type LinkState,
} from "../actions/links";

type Recipient = {
  id: number;
  kind: "email" | "domain" | "user";
  value: string;
  permission: "listen" | "download";
  expires_at: number | null;
  name: string | null;
  handle: string | null;
  visits: number;
  last_seen: number | null;
  listened: number;
  downloaded: number;
  people: string[];
};
type Request = { id: number; email: string; name: string; note: string; created_at: number; handle: string | null; verified: string | null };
type Event = { kind: string; email: string | null; created_at: number; title: string | null };
export type ShareLinkView = {
  id: number;
  label: string;
  permission: "listen" | "download";
  requests_on: number;
  requests_paused_at: number | null;
  expires_at: number | null;
  revoked_at: number | null;
  created_at: number;
  recipients: Recipient[];
  requests: Request[];
  events: Event[];
};

const PERM = { listen: "Listen", download: "Listen + Download" } as const;
/** One line per person: what they've done so far (nothing yet, or visits, plays, downloads, last seen). */
function activity(r: Recipient) {
  if (!r.visits) return "Not opened yet";
  const bits = [`${r.visits} ${r.visits === 1 ? "visit" : "visits"}`, `${r.listened} played`];
  if (r.downloaded) bits.push(`${r.downloaded} downloaded`);
  if (r.last_seen) bits.push(`last ${fmtDate(r.last_seen)}`);
  return bits.join(" · ");
}
const day = (ts: number) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const EVENT: Record<string, string> = {
  created: "Link made",
  reset: "Link reset",
  revoked: "Link revoked",
  verified: "Got in",
  denied: "Turned away",
  listened: "Played",
  downloaded: "Downloaded",
  requested: "Asked to join",
  request_approved: "Request approved",
  request_declined: "Request declined",
  request_blocked: "Blocked",
  requests_paused: "Requests paused (many waiting)",
  probed: "Warning: many unknown addresses asked for codes",
  sender_stopped: "The artist stopped sharing a track",
  recipient_added: "Added",
  recipient_removed: "Removed",
};

/** Copies a just-made address. It's shown only now: only a fingerprint is stored. */
function FreshUrl({ url }: { url: string }) {
  const toast = useToast();
  return (
    <div className="mt-3 rounded-[11px] border border-lime/40 bg-lime/[0.06] p-3 text-[12px]">
      <p className="font-semibold text-bone">Copy this link now</p>
      <p className="mt-1 text-mute">For safety it&apos;s shown only once. Lost it? Reset the link to make a new one (the old one stops working).</p>
      <div className="mt-2 flex gap-2">
        <input readOnly value={url} aria-label="New share link" className="input min-w-0 flex-1 font-mono" onFocus={(e) => e.currentTarget.select()} />
        <button
          type="button"
          className={`${LIME_SM} shrink-0`}
          onClick={() => navigator.clipboard.writeText(url).then(() => toast.show({ message: "Link copied" }), () => toast.show({ message: url }))}
        >
          Copy
        </button>
      </div>
    </div>
  );
}

function NewLink({ collectionId }: { collectionId: number }) {
  const [state, create, pending] = useActionState<LinkState, FormData>(createShareLink.bind(null, collectionId), null);
  const [open, setOpen] = useState(false);
  if (!open && !state?.url)
    return (
      <button type="button" onClick={() => setOpen(true)} className={GHOST}>
        New share link
      </button>
    );
  return (
    <div className="w-full rounded-[13px] border border-line bg-well p-3">
      {state?.url ? (
        <>
          <FreshUrl url={state.url} />
          <p className="mt-2 text-[12px] text-mute">Next: add the people who may open it below. Nobody gets in without being on the list (or asking you).</p>
        </>
      ) : (
        <form action={create} className="grid gap-2.5 text-[12px] sm:grid-cols-2">
          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Name (listeners never see it)</span>
            <input name="label" maxLength={60} placeholder="e.g. Label A&R" className="input text-[12px]" />
          </label>
          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>What people can do</span>
            <select name="permission" defaultValue="listen" className="input text-[12px]">
              <option value="listen">Listen (recommended for unreleased music)</option>
              <option value="download">Listen + Download</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className={FIELD_LABEL}>Works for</span>
            <select name="days" defaultValue="14" className="input text-[12px]">
              <option value="7">7 days</option>
              <option value="14">14 days (recommended)</option>
              <option value="30">30 days</option>
              <option value="90">90 days</option>
              <option value="none">Until I revoke it</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center gap-2 self-end text-mute">
            <input type="checkbox" name="requests" defaultChecked className="size-4 accent-lime" />
            <span>People not on the list can ask to join</span>
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button disabled={pending} className={LIME}>
              {pending ? "Making…" : "Make link"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className={GHOST_ON_WELL.replace("min-h-9", "min-h-11")}>
              Cancel
            </button>
          </div>
          {state?.error && (
            <p role="alert" className="text-danger sm:col-span-2">
              {state.error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}

function LinkCard({ link, at }: { link: ShareLinkView; at: number }) {
  const toast = useToast();
  const [fresh, setFresh] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const [addState, add, adding] = useActionState<LinkState, FormData>(addLinkRecipients.bind(null, link.id), null);
  const dead = !!link.revoked_at || (!!link.expires_at && link.expires_at < at);
  return (
    <li className={`rounded-[13px] border border-line bg-well p-3 text-[12px] ${dead ? "opacity-60" : ""}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[13px] font-semibold text-bone">
          {link.label || "Share link"} <span className="font-normal text-mute">· {PERM[link.permission]}</span>
        </p>
        <p className="text-[11px] text-faint">
          {link.revoked_at ? `Revoked ${day(link.revoked_at)}` : link.expires_at ? `${link.expires_at < at ? "Expired" : "Works until"} ${day(link.expires_at)}` : "Until you revoke it"}
        </p>
      </div>
      {fresh && <FreshUrl url={fresh} />}

      {!dead && (
        <>
          {/* Who may open it */}
          <p className="mt-3 text-[11.5px] font-semibold text-mute">People ({link.recipients.length})</p>
          {link.recipients.length > 0 && (
            <ul className="mt-1.5 divide-y divide-line rounded-[11px] border border-line bg-card">
              {link.recipients.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 px-2.5 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate">
                    {r.kind === "user" ? (
                      <>
                        {r.name} <span className="text-faint">@{r.handle}</span>
                      </>
                    ) : r.kind === "domain" ? (
                      <>Anyone at @{r.value}</>
                    ) : (
                      r.value
                    )}
                    <span className="text-faint"> · {PERM[r.permission]}{r.expires_at ? ` · until ${day(r.expires_at)}` : ""}</span>
                    </span>
                    <span className="block truncate text-[11px] text-faint">
                      {activity(r)}
                      {r.people.length > 0 && <> · {r.people.join(", ")}</>}
                    </span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`Remove ${r.kind === "user" ? `@${r.handle}` : r.kind === "domain" ? `@${r.value}` : r.value}`}
                    onClick={() =>
                      start(async () => {
                        const who = r.kind === "user" ? r.name || `@${r.handle}` : r.kind === "domain" ? `everyone at @${r.value}` : r.value;
                        if (!confirm(`Remove ${who}? Their access ends now, even mid-listen. Everyone else keeps theirs.`)) return;
                        await removeLinkRecipient(r.id);
                        toast.show({ message: "Removed. Their access has ended." });
                      })
                    }
                    className="tap-text shrink-0 text-[12px] font-semibold text-mute hover:text-danger"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form action={add} className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input name="who" required aria-label="Add people" placeholder="Emails, @company.com or @username" className="input min-w-0 flex-1 text-[12px]" />
            {link.permission === "download" && (
              <select name="permission" defaultValue="listen" aria-label="What they can do" className="input text-[12px] sm:w-44">
                <option value="listen">Listen</option>
                <option value="download">Listen + Download</option>
              </select>
            )}
            <button disabled={adding} className={GHOST_ON_WELL}>
              Add
            </button>
          </form>
          <p className="mt-1 text-[11px] text-faint">@usernames are emailed and find it under Shared with you. Send the address yourself to emails and company domains.</p>
          {addState?.problems?.length ? (
            <ul className="mt-1.5 text-danger">
              {addState.problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}

          {/* Requests to join */}
          {link.requests.length > 0 && (
            <>
              <p className="mt-3 text-[11.5px] font-semibold text-mute">Asking to join ({link.requests.length})</p>
              <ul className="mt-1.5 flex flex-col gap-2">
                {link.requests.map((q) => (
                  <li key={q.id} className="rounded-[11px] border border-line bg-card p-2.5">
                    <p>
                      <span className="font-semibold text-bone">{q.name || q.email}</span>
                      {q.handle && <span className="text-faint"> @{q.handle}</span>}
                      {q.verified === "verified" && <span className="ml-1 text-lime">Verified</span>}
                      <span className="text-faint"> · {q.email} · via this link · {fmtDate(q.created_at)}</span>
                    </p>
                    {q.note && <p className="mt-1 text-mute">&ldquo;{q.note}&rdquo;</p>}
                    <form className="mt-2 flex flex-wrap items-center gap-2">
                      <select name="permission" defaultValue="listen" aria-label="What they get" className="input w-auto text-[12px]">
                        <option value="listen">Listen</option>
                        {link.permission === "download" && <option value="download">Listen + Download</option>}
                      </select>
                      <select name="days" defaultValue="14" aria-label="For how long" className="input w-auto text-[12px]">
                        <option value="7">7 days</option>
                        <option value="14">14 days</option>
                        <option value="30">30 days</option>
                      </select>
                      <button formAction={answerLinkRequest.bind(null, q.id, "approve")} className={LIME_SM}>
                        Approve
                      </button>
                      <button formAction={answerLinkRequest.bind(null, q.id, "decline")} className={GHOST}>
                        Decline
                      </button>
                      <button formAction={answerLinkRequest.bind(null, q.id, "block")} className="tap-text px-1 text-[12px] font-semibold text-mute hover:text-danger">
                        Block
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          )}
          {link.requests_paused_at && (
            <p className="mt-2 rounded-[11px] border border-danger/40 bg-danger/10 px-2.5 py-2 text-danger">
              This link is getting a lot of requests. It may have been shared publicly. Reset it, or turn requests back on.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                start(async () => {
                  if (!confirm("Reset this link? The current address stops working and everyone using it is signed out. You'll get a new address to share.")) return;
                  const r = await resetShareLink(link.id);
                  if (r?.url) setFresh(r.url);
                })
              }
              className={GHOST_ON_WELL}
            >
              Reset link
            </button>
            <button type="button" disabled={busy} onClick={() => start(() => setLinkRequests(link.id, !(link.requests_on && !link.requests_paused_at)))} className={GHOST_ON_WELL}>
              {link.requests_on && !link.requests_paused_at ? "Turn off requests" : "Allow requests"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => start(async () => void (confirm("Revoke this link for everyone? It can't be undone; the music stays in your collection.") && (await revokeShareLink(link.id))))}
              className={DANGER}
            >
              Revoke
            </button>
          </div>
        </>
      )}

      {link.events.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer py-3.5 text-[11.5px] font-semibold text-mute hover:text-bone">Activity</summary>
          <ul className="mt-1.5 space-y-0.5 text-mute">
            {link.events.map((e, i) => (
              <li key={i}>
                {EVENT[e.kind] ?? e.kind}
                {e.email && <> · {e.email}</>}
                {e.title && <> · “{e.title}”</>}
                <span className="text-faint"> · {fmtDate(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

/**
 * Share links for this collection: separate from your submission link, each with its own address, permission, expiry
 * and named people. Nobody listens anonymously; people not on the list can ask (if you allow it).
 */
export function ShareLinks({ collectionId, links, sharedTracks, at }: { collectionId: number; links: ShareLinkView[]; /** When the page was made: which links have expired. */ at: number; sharedTracks: number }) {
  return (
    <section aria-labelledby="links-h" className={`${CARD} p-3`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <SectionHead id="links-h" icon="share" title="Share links" />
          <p className="mt-1.5 max-w-xl text-[12px] text-mute">
            Let named people listen or download. They confirm their email first, and you see who opened what.{" "}
            {sharedTracks} track{sharedTracks === 1 ? "" : "s"} here can be shared: their senders agreed.
          </p>
        </div>
        <NewLink collectionId={collectionId} />
      </div>
      {links.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {links.map((l) => (
            <LinkCard key={l.id} link={l} at={at} />
          ))}
        </ul>
      )}
    </section>
  );
}
