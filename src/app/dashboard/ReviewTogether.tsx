"use client";

import { FormError } from "@/components/Feedback";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { fmtDate } from "@/lib/format";
import { commentOnTrack, deleteComment, shortlistTrack } from "./actions/team";
import { CARD } from "@/components/Kit";

type Comment = { id: number; user_id: number; name: string; body: string; created_at: number };

/**
 * Review Together on one track, for an account's team: the shared shortlist and comments. Internal to the team;
 * senders never see it. Keep / Not for me is the desk's own buttons (roles decide who can change what). Every action
 * is checked again on the server.
 */
export function ReviewTogether({
  trackId,
  meId,
  canModerate,
  comments,
  shortlistedBy,
}: {
  trackId: number;
  /** The signed-in person (their own comments can be deleted). */
  meId: number;
  /** Owners and admins can delete anyone's comment. */
  canModerate: boolean;
  comments: Comment[];
  /** Who put it on the shortlist, or null. */
  shortlistedBy: string | null;
}) {
  const [error, post, posting] = useActionState(commentOnTrack.bind(null, trackId), null);
  const [busy, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  const last = useRef(comments.length);
  // Clear the box once the new comment shows up.
  useEffect(() => {
    if (comments.length > last.current) form.current?.reset();
    last.current = comments.length;
  }, [comments.length]);

  return (
    <section aria-label="Review together" className={`${CARD} p-3.5 sm:p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold tracking-[-0.015em] text-bone">Review together</h2>
        <button
          type="button"
          disabled={busy}
          aria-pressed={!!shortlistedBy}
          onClick={() => start(() => shortlistTrack(trackId))}
          className={shortlistedBy ? "btn-lime btn-sm" : "btn-ghost btn-sm"}
        >
          {shortlistedBy ? `★ Shortlisted by ${shortlistedBy}` : "☆ Shortlist"}
        </button>
      </div>

      {comments.length > 0 && (
        <ul className="mt-3 space-y-2">
          {comments.map((c) => (
            <li key={c.id} className="rounded-[11px] border border-line bg-well px-3 py-2 text-[12px]">
              <p className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-bold text-bone">{c.name}</span>
                <span className="text-[11px] text-faint">
                  {fmtDate(c.created_at)}
                  {(c.user_id === meId || canModerate) && (
                    <button type="button" className="ml-2 underline-offset-2 hover:text-danger hover:underline tap-text" onClick={() => start(() => deleteComment(c.id))}>
                      Delete
                    </button>
                  )}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-wrap text-mute">{c.body}</p>
            </li>
          ))}
        </ul>
      )}

      <form ref={form} action={post} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label className="sr-only" htmlFor={`comment-${trackId}`}>
          Comment for the team
        </label>
        <textarea id={`comment-${trackId}`} name="body" required rows={1} maxLength={1000} placeholder="Comment for the team" className="input min-h-11 min-w-0 flex-1 rounded-xl! bg-well! max-sm:text-base sm:text-[12px]" />
        <button disabled={posting} className="btn-ghost btn-sm shrink-0">
          {posting ? "Posting…" : "Comment"}
        </button>
      </form>
      <FormError className="mt-2">{error}</FormError>
      <p className="mt-2 text-[11px] text-faint">Only you and the team see comments and the shortlist.</p>
    </section>
  );
}
