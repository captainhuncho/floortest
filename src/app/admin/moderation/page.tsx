import { requireAdmin } from "@/lib/admin";
import Link from "next/link";
import { ConfirmButton } from "../AdminUi";
import { likeContains, q } from "@/lib/db";
import { fmtBytes } from "@/lib/format";
import { blockEverywhere, blockSenderAsAdmin, keepTrack, removeTrackAsAdmin } from "../actions";
import { OpsForm } from "../OpsForm";
import { ModerationPlayer } from "./ModerationPlayer";
import { staffMayPlay } from "@/lib/staff-listen";
import { switchOn } from "@/lib/switches";
import { Queue } from "./queue/Queue";

type Found = {
  id: number; title: string; artist: string; size: number; created_at: number; handle: string; user_id: number; sender_id: number; sender: string; email: string; blocked_at: number | null;
  ops_reviewed_at: number | null; reviewed_by: string | null;
};

const COLS = "t.id, t.title, t.artist, t.size, t.created_at, u.handle, u.id AS user_id, s.id AS sender_id, s.name AS sender, s.email, s.blocked_at, t.ops_reviewed_at, r.handle AS reviewed_by";
const FROM = "FROM tracks t JOIN users u ON u.id = t.user_id JOIN senders s ON s.id = t.sender_id LEFT JOIN users r ON r.id = t.ops_reviewed_by";
const day = (ms: number) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

/**
 * Find any track or sender across every account, for abuse reports and takedowns. Results on the left; the picked
 * track on the right (on phones, on its own with a way back) with a player, the sender's history and the actions.
 */
export default async function Moderation({ searchParams }: { searchParams: Promise<{ q?: string; t?: string; u?: string }> }) {
  const admin = await requireAdmin("moderation");
  const sp = await searchParams;
  // The new ops shell (switch ops_shell) gets the signal queue (admin redesign B, step 4); off, today's page as it was.
  if (await switchOn("ops_shell")) return <Queue sp={sp} me={admin.handle} access={admin.access} />;
  const search = (sp.q || "").trim().slice(0, 100);
  const like = likeContains(search);
  const tracks = search
    ? await q.all<Found>(
        `SELECT ${COLS} ${FROM}
         WHERE t.deleted_at IS NULL AND (t.title ILIKE ? OR t.artist ILIKE ? OR s.email ILIKE ? OR s.name ILIKE ? OR t.token = ?)
         ORDER BY t.created_at DESC LIMIT 100`,
        like, like, like, like, search,
      )
    : [];
  // Whole numbers in range only, like the audio route: "?t=1.5" or a 15-digit id must not reach Postgres as an int.
  const asked = Number(sp.t);
  const pickedId = (Number.isInteger(asked) && asked >= 1 && asked <= 2_147_483_647 ? asked : 0) || tracks[0]?.id || 0;
  const picked = pickedId ? (tracks.find((t) => t.id === pickedId) ?? (await q.get<Found>(`SELECT ${COLS} ${FROM} WHERE t.id = ? AND t.deleted_at IS NULL`, pickedId))) : undefined;
  const chosen = !!sp.t && !!picked;
  const href = (t: number) => `/admin/moderation?${new URLSearchParams({ ...(search ? { q: search } : {}), t: String(t) })}`;
  const senderCount = new Set(tracks.map((t) => t.email.toLowerCase())).size;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Moderation</h1>
        <p className="mt-1 text-mute">Search every account by track, artist, sender name or email, or a receipt token.</p>
      </div>
      <form className="flex flex-wrap items-center gap-2" role="search">
        <input name="q" defaultValue={search} className="input min-w-0 flex-1 sm:max-w-lg" placeholder="Search tracks and senders" aria-label="Search" />
        <button className="btn-lime btn-sm">Search</button>
        {search && (
          <span className="ml-auto text-sm text-faint tnum">
            {tracks.length === 100 ? "Newest 100 tracks" : `${tracks.length} track${tracks.length === 1 ? "" : "s"}`} · {senderCount} sender{senderCount === 1 ? "" : "s"}
          </span>
        )}
      </form>

      {search && !tracks.length && <p className="rounded-[14px] border border-line p-6 text-mute">Nothing matches. Try part of an email, or the artist name.</p>}

      {(tracks.length > 0 || picked) && (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_26rem]">
          <ul className={`overflow-hidden rounded-[14px] border border-line bg-ink-2 ${chosen ? "hidden lg:block" : ""}`} aria-label="Results">
            {tracks.map((t) => (
              <li key={t.id} className="border-b border-line last:border-b-0">
                <Link href={href(t.id)} aria-current={t.id === picked?.id ? "true" : undefined} className={`flex items-center gap-3 px-4 py-3 ${t.id === picked?.id ? "bg-ink-4" : "hover:bg-ink-3"}`}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">
                      {t.artist} – {t.title}
                    </span>
                    <span className="block truncate text-[12.5px] text-mute">
                      {t.email} → @{t.handle}
                      {t.blocked_at && <span className="chip ml-2 border-line text-mute">Blocked</span>}
                      {t.ops_reviewed_at && <span className="chip ml-2 border-line text-mute">Reviewed</span>}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-[12.5px] text-faint tnum">
                    {day(t.created_at)}
                    <br />
                    {fmtBytes(t.size)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {picked && <Detail t={picked} back={chosen ? `/admin/moderation${search ? `?q=${encodeURIComponent(search)}` : ""}` : null} />}
        </div>
      )}
    </div>
  );
}

async function Detail({ t, back }: { t: Found; back: string | null }) {
  const [meta, history, events, playable] = await Promise.all([
    q.get<{ peaks: string | null; duration: number | null; name: string }>("SELECT t.peaks, t.duration, u.name FROM tracks t JOIN users u ON u.id = t.user_id WHERE t.id = ?", t.id),
    q.get<{ tracks: number; receivers: number; blocked: number }>(
      `SELECT COUNT(t.id) AS tracks, COUNT(DISTINCT s.user_id) AS receivers, COUNT(DISTINCT s.id) FILTER (WHERE s.blocked_at IS NOT NULL) AS blocked
       FROM senders s LEFT JOIN tracks t ON t.sender_id = s.id AND t.deleted_at IS NULL WHERE lower(s.email) = lower(?)`,
      t.email,
    ),
    q.all<{ type: string; detail: string; created_at: number }>("SELECT type, detail, created_at FROM events WHERE track_id = ? ORDER BY created_at DESC LIMIT 5", t.id),
    staffMayPlay(t.id),
  ]);
  const peaks = meta?.peaks ? (JSON.parse(meta.peaks) as number[]) : null;
  const sent = Number(history?.tracks ?? 0);
  const receivers = Number(history?.receivers ?? 0);
  const blocked = Number(history?.blocked ?? 0);
  return (
    <section aria-labelledby="mod-track" className="rounded-[14px] border border-line bg-ink-2 p-4 sm:p-5 lg:sticky lg:top-6">
      {back && (
        <Link href={back} className="mb-3 inline-flex min-h-11 items-center text-sm text-mute hover:text-bone lg:hidden">
          ‹ All results
        </Link>
      )}
      <p className="text-[11px] font-bold uppercase tracking-[1px] text-faint">Track</p>
      <h2 id="mod-track" className="mt-1 text-[19px] font-bold tracking-tight">
        {t.title}
      </h2>
      <p className="text-mute">{t.artist}</p>
      {/* Staff listen only to disputed tracks (owner, 1 Nov 2026); the audio route refuses the rest too. */}
      {playable ? (
        <ModerationPlayer key={t.id} id={t.id} title={t.title} artist={t.artist} peaks={peaks} duration={meta?.duration ?? null} />
      ) : (
        <p className="mt-4 rounded-[10px] bg-ink-3 px-3 py-2.5 text-[13px] text-mute ring-1 ring-line">Listening is only for tracks with an open takedown claim.</p>
      )}
      <dl className="mt-5 grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 border-t border-line pt-4 text-[13px]">
        <dt className="text-faint">Sender</dt>
        <dd className="truncate">
          {t.sender} <span className="text-mute">{t.email}</span>
        </dd>
        <dt className="text-faint">Sent to</dt>
        <dd className="truncate">
          <Link href={`/admin/accounts/${t.user_id}`} className="hover:underline">
            @{t.handle}
          </Link>{" "}
          <span className="text-faint">{meta?.name}</span>
        </dd>
        <dt className="text-faint">Received</dt>
        <dd>{new Date(t.created_at).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</dd>
        <dt className="text-faint">File</dt>
        <dd>{fmtBytes(t.size)}</dd>
        <dt className="text-faint">Track id</dt>
        <dd className="font-mono text-[12px]">#{t.id}</dd>
        <dt className="text-faint">History</dt>
        <dd>
          {sent} track{sent === 1 ? "" : "s"} to {receivers} receiver{receivers === 1 ? "" : "s"}
          {blocked > 0 && <span className="text-danger"> · blocked by {blocked}</span>}
        </dd>
        <dt className="text-faint">Reviewed</dt>
        <dd>
          {t.ops_reviewed_at
            ? `Kept by @${t.reviewed_by ?? "a former team member"}, ${new Date(t.ops_reviewed_at).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
            : <span className="text-mute">Not yet</span>}
        </dd>
      </dl>
      <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
        <OpsForm action={keepTrack.bind(null, t.id)}>
          <button className="btn-lime btn-sm">Keep</button>
        </OpsForm>
        {!t.blocked_at && (
          <ConfirmButton action={blockSenderAsAdmin.bind(null, t.sender_id)} message={`Block ${t.email} from @${t.handle}'s link?`} className="btn-ghost btn-sm">
            Block sender for @{t.handle}
          </ConfirmButton>
        )}
        <ConfirmButton action={blockEverywhere.bind(null, t.email)} message={`Block ${t.email} from sending to anyone on FloorTest?`} className="btn-ghost btn-sm">
          Block everywhere
        </ConfirmButton>
        <ConfirmButton
          action={removeTrackAsAdmin.bind(null, t.id, "")}
          message={`Remove "${t.title}" from @${t.handle}'s desk and delete the file? This can't be undone.`}
          className="btn-sm rounded-md border border-danger/50 px-3 font-semibold text-danger hover:bg-danger/10 sm:ml-auto"
        >
          Remove track…
        </ConfirmButton>
      </div>
      {events.length > 0 && (
        <ol className="mt-5 space-y-1.5 border-t border-line pt-4 font-mono text-[12px] text-mute" aria-label="Recent activity">
          {events.map((e, i) => (
            <li key={i} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
              <span className="text-faint tnum">{new Date(e.created_at).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="truncate">
                <span className="text-bone">{e.type}</span>
                {e.detail && ` · ${e.detail}`}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
