import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { q, type Track } from "@/lib/db";
import { leaveShared, voteOnTrack } from "../../actions";
import { memberCollection, members, type Vote } from "@/lib/team";

export const metadata = { title: "Shared collection — FloorTest" };

/** A teammate's view of a shared collection: listen, vote keep or pass, add a note. The owner decides. */
export default async function SharedCollection({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const c = await memberCollection(user.id, Number((await params).id));
  if (!c) notFound();
  const tracks = await q.all<Track>(
    "SELECT * FROM tracks WHERE collection_id = ? AND deleted_at IS NULL AND created_at >= ? ORDER BY created_at DESC LIMIT 500",
    c.id,
    c.added_at,
  );
  const votes = tracks.length
    ? await q.all<Vote & { track_id: number }>(
        `SELECT v.track_id, v.user_id, u.name, v.vote, v.note, v.created_at FROM track_votes v JOIN users u ON u.id = v.user_id
         WHERE v.track_id IN (${tracks.map(() => "?").join(",")}) ORDER BY v.created_at`,
        ...tracks.map((t) => t.id),
      )
    : [];
  const team = await members(c.id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-5 text-bone sm:px-8 md:py-8">
      <div className="flex flex-col gap-1">
        <Link href="/dashboard/collections" className="text-[11px] font-medium text-faint hover:text-bone">
          ← Collections
        </Link>
        <h1 className="text-[28px] font-bold tracking-[-0.8px] md:text-[32px]">{c.name}</h1>
        <p className="text-sm text-mute">
          Shared by {c.owner_name} with {team.map((m) => (m.id === user.id ? "you" : m.name)).join(", ")}. Vote keep or pass; {c.owner_name} makes the call.
        </p>
      </div>

      {tracks.length ? (
        <ul className="flex flex-col gap-3">
          {tracks.map((t) => {
            const mine = votes.find((v) => v.track_id === t.id && v.user_id === user.id);
            const others = votes.filter((v) => v.track_id === t.id && v.user_id !== user.id);
            return (
              <li key={t.id} className="rounded-xl border border-line bg-ink-2 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="min-w-0 truncate text-[15px] font-bold">
                    {t.title}
                    {t.artist && <span className="font-normal text-mute"> · {t.artist}</span>}
                  </p>
                  <p className="text-[11px] text-mute tnum">{[t.genre, t.bpm ? `${Math.round(t.bpm)} BPM` : null, t.decision === "kept" ? "Kept" : t.decision ? "Passed" : null].filter(Boolean).join(" · ")}</p>
                </div>
                <audio controls preload="none" src={`/api/tracks/${t.id}/audio`} className="mt-3 w-full" aria-label={`Play ${t.title}`} />
                <form className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <input name="note" defaultValue={mine?.note ?? ""} maxLength={500} aria-label={`Note on ${t.title}`} placeholder="Note for the team (optional)" className="input min-w-0 flex-1 text-[12px]" />
                  <div className="flex gap-2">
                    <button formAction={voteOnTrack.bind(null, t.id, "keep")} aria-pressed={mine?.vote === "keep"} className={mine?.vote === "keep" ? "btn-lime btn-sm" : "btn-ghost btn-sm"}>
                      Keep
                    </button>
                    <button formAction={voteOnTrack.bind(null, t.id, "pass")} aria-pressed={mine?.vote === "pass"} className={mine?.vote === "pass" ? "btn-lime btn-sm" : "btn-ghost btn-sm"}>
                      Pass
                    </button>
                  </div>
                </form>
                {others.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-line pt-3 text-[12px] text-mute">
                    {others.map((v) => (
                      <li key={v.user_id}>
                        <span className="font-bold text-bone">{v.name}</span>: {v.vote === "keep" ? "keep" : "pass"}
                        {v.note && <> · &ldquo;{v.note}&rdquo;</>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="rounded-xl border border-line bg-ink-3 p-4 text-[12px] text-mute">Nothing to hear yet. Tracks sent from now on appear here.</p>
      )}

      <form action={leaveShared.bind(null, c.id)}>
        <button className="text-[11px] font-bold text-mute hover:text-danger">Leave this collection</button>
      </form>
    </div>
  );
}
