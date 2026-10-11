"use client";

import { useActionState, useTransition } from "react";
import { changeTeamRole, inviteTeammate, saveReplyApproval, type TeamState } from "../../actions/account-team";

export function InviteForm({ canInviteAdmins, full }: { canInviteAdmins: boolean; full: boolean }) {
  const [state, act, pending] = useActionState<TeamState, FormData>(inviteTeammate, null);
  return (
    <form action={act} className="mt-4 flex flex-col gap-2 sm:flex-row">
      <label htmlFor="team-email" className="sr-only">
        Email to invite
      </label>
      <input id="team-email" name="email" type="email" required disabled={full} placeholder="name@label.com" className="input min-w-0 flex-1" />
      {canInviteAdmins && (
        <select name="role" defaultValue="member" aria-label="Role" className="input sm:w-36">
          <option value="member">Member</option>
          <option value="admin">Admin</option>
        </select>
      )}
      <button disabled={pending || full} className="btn-lime btn-sm min-h-11 shrink-0">
        {pending ? "Sending…" : "Invite"}
      </button>
      {state && (
        <p role={state.error ? "alert" : "status"} className={`text-sm sm:basis-full ${state.error ? "text-danger" : "text-mute"}`}>
          {state.error ?? state.ok}
        </p>
      )}
    </form>
  );
}

export function ApprovalForm({ on, approver, people }: { on: boolean; approver: number; people: { user_id: number; name: string }[] }) {
  const [state, act, pending] = useActionState<TeamState, FormData>(saveReplyApproval, null);
  return (
    <form action={act} className="flex flex-col gap-3 text-sm">
      <label className="flex items-center gap-2">
        <input type="checkbox" name="approval" defaultChecked={on} className="size-4 accent-lime" />
        Members&apos; replies need approval before they&apos;re sent
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-mute">Who approves (the owner and admins can always approve too)</span>
        <select name="approver" defaultValue={approver} className="input sm:w-72">
          {people.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn-ghost btn-sm min-h-11">
          {pending ? "Saving…" : "Save"}
        </button>
        {state && <span className={state.error ? "text-danger" : "text-mute"}>{state.error ?? state.ok}</span>}
      </div>
    </form>
  );
}

/** The owner's role picker for one person: saves as soon as it changes (an admin needs two-step sign-in to act as one). */
export function RoleSelect({ memberId, name, role }: { memberId: number; name: string; role: "admin" | "member" }) {
  const [pending, start] = useTransition();
  return (
    <select
      aria-label={`Role for ${name}`}
      defaultValue={role}
      disabled={pending}
      onChange={(e) => {
        const next = e.currentTarget.value as "admin" | "member";
        start(() => changeTeamRole(memberId, next));
      }}
      className="input h-9 w-auto py-0 pr-8 text-[12px]"
    >
      <option value="member">Member</option>
      <option value="admin">Admin</option>
    </select>
  );
}
