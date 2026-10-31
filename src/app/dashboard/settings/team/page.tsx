import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import Link from "next/link";
import { atLeast, canApprove, heldReplies, ownerNeedsTwoStep, replyApproval, ROLE_LABEL, teamOf, teamsOn } from "@/lib/account-members";
import { fmtDate, fmtDay } from "@/lib/format";
import { answerHeldReply, removeTeammate } from "../../actions/account-team";
import { ConfirmButton } from "../../ClientBits";
import { PageTitle, Section } from "../Section";
import { Chip, initials } from "@/components/Kit";
import { BTN, BTN_GHOST, Notice, ROW, WELL } from "../ui";
import { ApprovalForm, CancelInviteForm, InviteForm, RoleSelect } from "./TeamForms";
import { Fold } from "../Fold";

export const metadata = { title: "Team — FloorTest" };

/** Each person's avatar: their initials (the owner in bright type; their role chip is the one lime on the list). */
function Avatar({ name, owner }: { name: string; owner?: boolean }) {
  return (
    <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-[11px] border border-line bg-card text-[12px] font-bold ${owner ? "text-bone" : "text-mute"}`}>
      {initials(name)}
    </span>
  );
}

/**
 * The people on this account. Everyone sees who's on it; owners and admins invite and remove; the owner changes
 * roles. Owners and admins choose whether members' replies to senders need approval, and by whom.
 */
export default async function Team({ searchParams }: { searchParams: Promise<{ denied?: string }> }) {
  const user = await requireUser();
  if (!(await teamsOn(user.id))) notFound();
  const { denied } = await searchParams;
  const team = await teamOf(user.id);
  // Owners manage the team only with two-step sign-in on (owner, 15 Oct), as A&R / Admins need it for their powers.
  const manage = atLeast(user.role, "admin") && !ownerNeedsTwoStep(user);
  const approval = await replyApproval(user.id);
  const approver = approval.approver === team.owner.id ? team.owner.name : team.members.find((m) => m.user_id === approval.approver)?.name;
  const held = await heldReplies(user);
  const approves = await canApprove(user);
  const people = [{ user_id: team.owner.id, name: team.owner.name }, ...team.members.map((m) => ({ user_id: m.user_id, name: m.name }))];
  const pausedCount = team.members.filter((m) => m.paused).length;
  return (
    <>
      <PageTitle title="Team" sub={`Everyone here has their own login on ${user.name}'s desk and its plan.`} />
      {denied && (
        <Notice tone="error" next="Ask the owner to open it, or to change your role.">
          That&apos;s for the account&apos;s {user.role === "admin" ? "owner" : "owner or an A&R / Admin"}.
        </Notice>
      )}

      <Section
        id="people-h"
        icon="contacts"
        title={`People (${team.used - team.invites.length} of ${team.seats} seats)`}
        sub={
          pausedCount
            ? `More people than seats, so ${pausedCount} ${pausedCount === 1 ? "is" : "are"} paused (the latest to join). Remove someone or add seats.`
            : team.used >= team.seats
              ? "All seats are in use. Remove someone, or ask us for extra seats."
              : undefined
        }
      >
        <Fold title="People" count={1 + team.members.length + team.invites.length} lead={`${team.owner.name} (${ROLE_LABEL.owner})${team.members.length ? ` and ${team.members.length} more` : ""}${team.invites.length ? `, ${team.invites.length} waiting to join` : ""}`}>
        <ul>
          <li className={ROW}>
            <span className="flex min-w-0 flex-1 items-center gap-2.5">
              <Avatar name={team.owner.name} owner />
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-bone">{team.owner.name}</span>
                <span className="block truncate text-[11.5px] text-mute">{team.owner.email}</span>
              </span>
            </span>
            <Chip tone="acc">{ROLE_LABEL.owner}</Chip>
          </li>
          {team.members.map((m) => {
            const self = m.user_id === user.actor_id;
            const canRemove = self || (manage && (m.role === "member" || user.role === "owner"));
            return (
              <li key={m.id} className={ROW}>
                <span className="flex min-w-0 flex-1 basis-56 items-start gap-2.5">
                  <Avatar name={m.name} />
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold text-bone">
                      {m.name} {self && <span className="font-normal text-mute">(you)</span>}
                    </span>
                    <span className="block truncate text-[11.5px] text-mute">
                      {m.email}, joined {fmtDay(m.created_at)}
                    </span>
                    {m.paused && <span className="mt-1 block text-[11.5px] text-danger">Paused: over your plan&apos;s seats. Remove someone or add seats to bring them back.</span>}
                    {m.role === "admin" && !m.twofa && (
                      <span className="mt-1 block text-[11.5px] text-[#d98a2b]">Works as a member until they turn on two-step sign-in.</span>
                    )}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {user.role === "owner" ? <RoleSelect memberId={m.id} name={m.name} role={m.role} /> : <Chip>{ROLE_LABEL[m.role]}</Chip>}
                  {canRemove && (
                    <ConfirmButton
                      action={removeTeammate.bind(null, m.id)}
                      message={self ? `Leave ${user.name}? You'll lose access to this desk now.` : `Remove ${m.name}? Their access to this desk ends now.`}
                      className="btn-danger btn-sm min-h-11 rounded-[12px] px-4!"
                    >
                      {self ? "Leave" : "Remove"}
                    </ConfirmButton>
                  )}
                </span>
              </li>
            );
          })}
          {team.invites.map((i) => (
            <li key={i.id} className={ROW}>
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
                <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[11px] border border-dashed border-line-2 text-faint">
                  @
                </span>
                <span className="min-w-0 truncate text-[12.5px] text-mute">
                  {i.email} · invited as {ROLE_LABEL[i.role].toLowerCase()} · expires {fmtDay(i.expires_at)}
                </span>
              </span>
              {manage && <CancelInviteForm inviteId={i.id} />}
            </li>
          ))}
        </ul>
        </Fold>
        {ownerNeedsTwoStep(user) && (
          <Notice
            tone="info"
            className="mt-4"
            next={
              <>
                <Link href="/dashboard/settings/security" className="inline-flex min-h-11 items-center text-bone underline underline-offset-4 hover:text-lime">
                  Turn it on under Security
                </Link>{" "}
                to invite people, change roles or reply approval.
              </>
            }
          >
            Two-step sign-in keeps the whole team safe.
          </Notice>
        )}
        {manage && <InviteForm canInviteAdmins={user.role === "owner"} full={team.used >= team.seats} />}
        <dl className="mt-5 grid gap-2 border-t border-line pt-4 text-[12px] leading-snug sm:grid-cols-3">
          {(
            [
              ["Owner", "Everything."],
              ["A&R / Admin", "Everything except plan, billing, account security and deleting the account. Can change members' calls and approve replies (needs two-step sign-in)."],
              ["Member", "Review, Keep / Not for me, notes and replies."],
            ] as const
          ).map(([r, what]) => (
            <div key={r} className="min-w-0">
              <dt className="font-semibold text-bone">{r}</dt>
              <dd className="text-mute">{what}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        id="approval-h"
        icon="reply"
        title="Replies from members"
        sub={approval.on ? `Members' replies to senders wait for ${approver ?? "the approver"} before they're sent.` : "Members' replies go to senders straight away."}
      >
        {manage ? <ApprovalForm on={approval.on} approver={approval.approver} people={people} /> : <p className="text-[12.5px] text-mute">Only the owner or an A&amp;R / Admin can change this.</p>}
      </Section>

      {(held.length > 0 || approves) && (
        <Section id="held-h" icon="clock" title={approves ? `Waiting for approval (${held.length})` : "Your replies waiting for approval"} sub={held.length ? undefined : "Nothing waiting. Members' replies show here when approval is on."}>
          <ul className="flex flex-col gap-3">
            {held.map((h) => (
              <li key={h.id} className={`${WELL} p-3.5`}>
                <p className="text-[12px] text-mute">
                  <span className="font-semibold text-bone">{h.author ?? "Someone"}</span> → {h.sender}
                  {h.title && <> · “{h.title}”</>} · {fmtDate(h.created_at)}
                </p>
                {approves ? (
                  <form className="mt-2.5 flex flex-col gap-2.5">
                    <label className="sr-only" htmlFor={`held-${h.id}`}>
                      Reply
                    </label>
                    <textarea id={`held-${h.id}`} name="body" defaultValue={h.body} rows={3} maxLength={4000} className="input" />
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <button formAction={answerHeldReply.bind(null, h.id, true)} className={BTN}>
                        Approve and send
                      </button>
                      <button formAction={answerHeldReply.bind(null, h.id, false)} className={BTN_GHOST}>
                        Don&apos;t send
                      </button>
                    </div>
                  </form>
                ) : (
                  <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-bone">{h.body}</p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
