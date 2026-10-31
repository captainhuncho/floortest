"use client";

import { useActionState, useState, useTransition } from "react";
import { cancelTeamInvite, changeTeamRole, inviteTeammate, saveReplyApproval, type TeamState } from "../../actions/account-team";
import { BTN, BTN_GHOST, FIELD, HELP, Notice } from "../ui";

export function InviteForm({ canInviteAdmins, full }: { canInviteAdmins: boolean; full: boolean }) {
  const [state, act, pending] = useActionState<TeamState, FormData>(inviteTeammate, null);
  return (
    <form action={act} className="mt-4 flex flex-col gap-2">
      <span className={FIELD}>Invite someone</span>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="team-email" className="sr-only">
          Email to invite
        </label>
        <input id="team-email" name="email" type="email" required disabled={full} placeholder="name@label.com" className="input min-w-0 flex-1" />
        {canInviteAdmins && (
          <select name="role" defaultValue="member" aria-label="Role" className="input sm:w-40">
            <option value="member">Member</option>
            <option value="admin">A&amp;R / Admin</option>
          </select>
        )}
        <button disabled={pending || full} className={`${BTN} shrink-0`}>
          {pending ? "Sending…" : "Invite"}
        </button>
      </div>
      {full && <p className={HELP}>Every seat is taken, so inviting waits until someone leaves or you add seats.</p>}
      {state?.error && (
        <Notice tone="error" next="No invite was sent. Fix that and try again.">
          {state.error}
        </Notice>
      )}
      {state?.ok && (
        <Notice tone="ok" next="They get an email with a link to join. It shows below until they accept.">
          {state.ok}
        </Notice>
      )}
    </form>
  );
}

export function ApprovalForm({ on, approver, people }: { on: boolean; approver: number; people: { user_id: number; name: string }[] }) {
  const [state, act, pending] = useActionState<TeamState, FormData>(saveReplyApproval, null);
  return (
    <form action={act} className="flex flex-col gap-4">
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-[13px] text-bone">
        <input type="checkbox" name="approval" defaultChecked={on} className="size-5 accent-lime" />
        Members&apos; replies need approval before they&apos;re sent
      </label>
      <label className="flex flex-col gap-1.5">
        <span className={FIELD}>Who approves</span>
        <select name="approver" defaultValue={approver} className="input sm:w-72">
          {people.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.name}
            </option>
          ))}
        </select>
        <span className={HELP}>The owner and A&amp;R / Admins can always approve too.</span>
      </label>
      {state?.error && (
        <Notice tone="error" next="Nothing was saved. Fix that and save again.">
          {state.error}
        </Notice>
      )}
      <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:gap-4">
        <button disabled={pending} className={`${BTN_GHOST} sm:px-6!`}>
          {pending ? "Saving…" : "Save"}
        </button>
        {state?.ok && (
          <p role="status" className="text-[12.5px] font-semibold text-[#6aa636]">
            {state.ok}
          </p>
        )}
      </div>
    </form>
  );
}

/** The owner's role picker for one person: saves as soon as it changes (an admin needs two-step sign-in to act as one). */
export function RoleSelect({ memberId, name, role }: { memberId: number; name: string; role: "admin" | "member" }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <select
        aria-label={`Role for ${name}`}
        defaultValue={role}
        disabled={pending}
        onChange={(e) => {
          const el = e.currentTarget;
          const next = el.value as "admin" | "member";
          setError(null);
          start(async () => {
            const r = await changeTeamRole(memberId, next);
            // Refused: the picker goes back to the role they still have, and says why.
            if (r?.error) {
              el.value = next === "admin" ? "member" : "admin";
              setError(r.error);
            }
          });
        }}
        className="input min-h-11 w-auto py-0 pr-8 text-[12px]"
      >
        <option value="member">Member</option>
        <option value="admin">A&amp;R / Admin</option>
      </select>
      {error && (
        <span role="alert" className="max-w-56 text-right text-[11.5px] text-danger">
          {error} Their role hasn&apos;t changed.
        </span>
      )}
    </span>
  );
}

/** Cancels one open invite; a refusal (or an invite already accepted or cancelled) is shown, not hidden. */
export function CancelInviteForm({ inviteId }: { inviteId: number }) {
  const [state, act, pending] = useActionState<TeamState>(cancelTeamInvite.bind(null, inviteId), null);
  return (
    <form action={act} className="flex flex-col items-end gap-1">
      <button disabled={pending} className={BTN_GHOST}>
        {pending ? "Cancelling…" : "Cancel invite"}
      </button>
      {state?.error && (
        <span role="alert" className="max-w-56 text-right text-[11.5px] text-danger">
          {state.error} Reload the page to see where it stands.
        </span>
      )}
    </form>
  );
}
