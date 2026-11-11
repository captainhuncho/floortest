import { siteEditor } from "@/lib/site-editor";
import { EditablePage, editable } from "@/components/Editable";
import { switchOn } from "@/lib/switches";
import { siteCopy } from "@/lib/content";
import { botCheckKey } from "@/lib/turnstile";
import { q } from "@/lib/db";
import { env, isPreview } from "@/lib/env";
import { googleConfig } from "@/lib/google-auth";
import { GuidedSignup } from "./GuidedSignup";
import { inviteBySecret } from "@/lib/account-members";
import { currentPerson } from "@/lib/auth";
import { maskEmail } from "@/lib/mask-email";
import { redirect } from "next/navigation";
import { matchInviteCode, personalInviteGone } from "@/lib/invites";

export const metadata = { title: "Claim your link — FloorTest" };

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ ref?: string; invite?: string; handle?: string; team?: string }> }) {
  const sp = await searchParams;
  const ref = (sp.ref || "").toUpperCase().slice(0, 32);
  const inviteCode = (sp.invite || "").toUpperCase().slice(0, 32);
  // A used, expired or revoked personal invite never shows the form as if it were live (owner, 5 Nov).
  if (inviteCode && (await personalInviteGone(inviteCode))) redirect("/invite/used");
  const match = inviteCode ? matchInviteCode(inviteCode) : null;
  const personal = match ? await q.get<{ email: string | null }>(`SELECT i.email FROM invites i WHERE ${match.sql} AND i.revoked_at IS NULL`, ...match.args) : undefined;
  const referrer = ref ? await q.get<{ name: string }>("SELECT name FROM users WHERE referral_code = ?", ref) : undefined;
  // Joining a team from an invite email: no invite code needed, and the email is the one invited.
  const team = sp.team ? await inviteBySecret(sp.team) : undefined;
  // A used, expired or cancelled team invite: the join page says so plainly, rather than a bare sign-up form.
  if (sp.team && !team) redirect(`/join/${encodeURIComponent(sp.team.slice(0, 200))}`);
  const inviteOnly = !(await switchOn("open_signup")) && !team;
  const [c, home, editor] = await Promise.all([siteCopy("auth"), siteCopy("home"), siteEditor()]);
  const { E } = editable(c, !!editor);
  const host = env.appUrl.replace(/^https?:\/\//, "");
  const hasInvite = !inviteOnly || !!team || !!personal?.email;
  // Anyone holding the invite link can open this page, so the invited address shows masked (owner, 2 Nov) and the
  // person types it themselves; sign-up checks it matches the invite. Shown in full only to someone already signed in
  // with that exact email.
  const invitedEmail = team?.email ?? personal?.email ?? undefined;
  const me = invitedEmail ? await currentPerson() : null;
  const isInvitee = !!invitedEmail && me?.email.toLowerCase() === invitedEmail.toLowerCase();
  const lockedEmail = isInvitee ? invitedEmail : undefined;
  const shownEmail = isInvitee ? invitedEmail : maskEmail(invitedEmail);
  const notice = team ? (
    <>
      You&apos;re joining <b>{team.account_name}</b> on FloorTest. Create your own login with <b>{shownEmail}</b>, the email your invite went to; you&apos;ll get your own link too.
    </>
  ) : personal?.email ? (
    <>
      You&apos;re invited. Sign up with <b>{shownEmail}</b>, the email your invite went to.
    </>
  ) : referrer && !inviteOnly ? (
    <>
      Invited by <b>{referrer.name}</b>. You both get 10 more active tracks once your first track arrives.
    </>
  ) : undefined;
  return (
    <EditablePage editing={!!editor} page="auth" label="Sign-up and log-in" values={c}>
      <GuidedSignup
        host={host}
        botKey={await botCheckKey()}
        // No invite code to type: the link's code rides along, and during the beta it must match the email (src/lib/invites.ts).
        hidden={team ? { team: sp.team! } : personal?.email ? { invite: inviteCode } : referrer && !inviteOnly ? { ref } : undefined}
        lockedEmail={lockedEmail}
        canSignUp={hasInvite}
        initialHandle={(sp.handle || "").toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 30) || undefined}
        google={!!googleConfig() && !isPreview}
        welcome={{ headline: home.headline, italic: home.headline_italic, intro: home.intro }}
        notice={notice}
        waitlistNote={<E k="signup_invite_only" />}
        claimTitle={<E k="signup_title" />}
      />
    </EditablePage>
  );
}
