import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { atLeast, canApprove, heldReplies, replyApproval, ROLE_LABEL, teamOf, teamsOn } from "@/lib/account-members";
import { fmtDate, fmtDay } from "@/lib/format";
import { answerHeldReply, cancelTeamInvite, removeTeammate } from "../../actions/account-team";
import { ConfirmButton } from "../../ClientBits";
import { PageTitle, Section } from "../Section";
import { ApprovalForm, InviteForm, RoleSelect } from "./TeamForms";

export const metadata = { title: "Team — FloorTest" };

/**
 * The people on this account. Everyone sees who's on it; owners and admins invite and remove; the owner changes
 * roles. Owners and admins choose whether members' replies to senders need approval, and by whom.
 */
export default async function Team({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  if (!(await teamsOn(user.id))) notFound();
  const { denied } = await searchParams;
  const team = await teamOf(user.id);
  const manage = atLeast(user.role, "admin");
  const approval = await replyApproval(user.id);
  const approver = approval.approver === team.owner.id ? team.owner.name : team.members.find((m) => m.user_id === approval.approver)?.name;
  const held = await heldReplies(user);
  const approves = await canApprove(user);
  const people = [{ user_id: team.owner.id, name: team.owner.name }, ...team.members.map((m) => ({ user_id: m.user_id, name: m.name }))];
  return (
    <>
      <PageTitle
        title="Team"
        sub={`Everyone here has their own login on ${user.name}'s desk and its plan.`}
      />
      {denied && (
        <p role="alert" className="rounded-lg border border-danger/40 px-4 py-3 text-sm">
          That&apos;s for the account&apos;s {user.role === "admin" ? "owner" : "owner or an A&R / Admin"}.
        </p>
      )}

      <Section id="people-h" title={`People (${team.used - team.invites.length} of ${team.seats} seats)`} sub={
          team.members.some((m) => m.paused)
            ? `More people than seats, so ${team.members.filter((m) => m.paused).length} ${team.members.filter((m) => m.paused).length === 1 ? "is" : "are"} paused (the latest to join). Remove someone or add seats.`
            : team.used >= team.seats
              ? "All seats are in use. Remove someone, or ask us for extra seats."
              : undefined
        }>
        <ul className="divide-y divide-line rounded-lg border border-line">
          <li className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="min-w-0 truncate">
              <span className="font-medium">{team.owner.name}</span> <span className="text-sm text-mute">· {team.owner.email}</span>
            </span>
            <span className="shrink-0 rounded-full border border-lime/50 px-2.5 py-0.5 text-[11px] font-bold text-lime">{ROLE_LABEL.owner}</span>
          </li>
          {team.members.map((m) => {
            const self = m.user_id === user.actor_id;
            const canRemove = self || (manage && (m.role === "member" || user.role === "owner"));
            return (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate font-medium">
                    {m.name} {self && <span className="text-sm font-normal text-mute">(you)</span>}
                  </span>
                  <span className="block truncate text-sm text-mute">
                    {m.email} · joined {fmtDay(m.created_at)}
                  </span>
                  {m.paused && (
                    <span className="mt-0.5 block text-[11px] text-danger">Paused: over your plan&apos;s seats. Remove someone or add seats to bring them back.</span>
                  )}
                  {m.role === "admin" && !m.twofa && (
                    <span className="mt-0.5 block text-[11px] text-danger">Works as a member until they turn on two-step sign-in.</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {user.role === "owner" ? (
                    <RoleSelect memberId={m.id} name={m.name} role={m.role} />
                  ) : (
                    <span className="rounded-full border border-line px-2.5 py-0.5 text-[11px] font-bold text-mute">{ROLE_LABEL[m.role]}</span>
                  )}
                  {canRemove && (
                    <ConfirmButton
                      action={removeTeammate.bind(null, m.id)}
                      message={self ? `Leave ${user.name}? You'll lose access to this desk now.` : `Remove ${m.name}? Their access to this desk ends now.`}
                      className="btn-danger btn-sm h-9"
                    >
                      {self ? "Leave" : "Remove"}
                    </ConfirmButton>
                  )}
                </span>
              </li>
            );
          })}
          {team.invites.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <span className="min-w-0 truncate text-mute">
                {i.email} · invited as {ROLE_LABEL[i.role].toLowerCase()} · expires {fmtDay(i.expires_at)}
              </span>
              {manage && (
                <form action={cancelTeamInvite.bind(null, i.id)}>
                  <button className="btn-ghost btn-sm h-9">Cancel invite</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {manage && <InviteForm canInviteAdmins={user.role === "owner"} full={team.used >= team.seats} />}
        <p className="mt-3 text-xs text-mute">
          Owner: everything. A&amp;R / Admin: everything except plan, billing, account security and deleting the account; can change members&apos; calls and approve
          replies (needs two-step sign-in). Member: review, Keep / Not for me, notes and replies.
        </p>
      </Section>

      <Section
        id="approval-h"
        title="Replies from members"
        sub={approval.on ? `Members' replies to senders wait for ${approver ?? "the approver"} before they're sent.` : "Members' replies go to senders straight away."}
      >
        {manage ? <ApprovalForm on={approval.on} approver={approval.approver} people={people} /> : <p className="text-sm text-mute">Only the owner or an A&R / Admin can change this.</p>}
      </Section>

      {(held.length > 0 || approves) && (
        <Section id="held-h" title={approves ? `Waiting for approval (${held.length})` : "Your replies waiting for approval"} sub={held.length ? undefined : "Nothing waiting."}>
          <ul className="flex flex-col gap-3">
            {held.map((h) => (
              <li key={h.id} className="rounded-lg border border-line p-3 text-sm">
                <p className="text-mute">
                  {h.author ?? "Someone"} → {h.sender}
                  {h.title && <> · “{h.title}”</>} · {fmtDate(h.created_at)}
                </p>
                {approves ? (
                  <form className="mt-2 flex flex-col gap-2">
                    <label className="sr-only" htmlFor={`held-${h.id}`}>
                      Reply
                    </label>
                    <textarea id={`held-${h.id}`} name="body" defaultValue={h.body} rows={3} maxLength={4000} className="input" />
                    <div className="flex gap-2">
                      <button formAction={answerHeldReply.bind(null, h.id, true)} className="btn-lime btn-sm">
                        Approve and send
                      </button>
                      <button formAction={answerHeldReply.bind(null, h.id, false)} className="btn-ghost btn-sm">
                        Don&apos;t send
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="mt-1 whitespace-pre-wrap">{h.body}</p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
