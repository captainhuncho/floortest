import Link from "next/link";
import { redirect } from "next/navigation";
import { MessagePage, PRIMARY } from "@/app/_ui/MessagePage";
import { confirmEmailChange, pendingEmailFor } from "@/lib/accounts";
import { audit } from "@/lib/audit";
import { currentPerson } from "@/lib/auth";
import { APP_URL, sendMail } from "@/lib/mail";

export const metadata = { title: "Confirm your new email — FloorTest", robots: { index: false } };

/** Needs a click (a POST), so email scanners that pre-open links can't confirm it. */
export default async function ConfirmEmail({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const done = !!(await searchParams).done;
  const pending = done ? null : await pendingEmailFor(token.slice(0, 100));
  const me = await currentPerson();

  async function confirm() {
    "use server";
    const r = await confirmEmailChange(token, (await currentPerson())?.id ?? null);
    if (r) {
      await audit(r.id, "settings_updated", "email changed");
      await sendMail({
        reserved: true,
        userId: r.id,
        audience: "support",
        to: r.from,
        subject: "Your FloorTest email was changed",
        body: `Hi,\n\nThe email on your FloorTest account is now ${r.to.replace(/^(.{2}).*@/, "$1…@")}. You've been signed out on every device.\n\nIf this wasn't you, contact us straight away: ${APP_URL}/contact\n\n— FloorTest`,
      }).catch(() => {});
    }
    redirect(r ? `/confirm-email/${encodeURIComponent(token)}?done=1` : `/confirm-email/${encodeURIComponent(token)}`);
  }

  const masked = (e: string) => e.replace(/^(.{2}).*@/, "$1…@");
  if (done)
    return (
      <MessagePage
        icon="check"
        tone="ok"
        title="Email changed"
        actions={
          <Link href="/login" className={PRIMARY}>
            Sign in
          </Link>
        }
      >
        <p>Sign in with your new email. For safety, you&apos;ve been signed out everywhere.</p>
      </MessagePage>
    );
  if (!pending)
    return (
      <MessagePage
        icon="link"
        tone="off"
        title="Link not recognised"
        actions={
          <Link href="/dashboard/settings/security" className={PRIMARY}>
            Open Settings
          </Link>
        }
      >
        <p>This link is invalid, expired, already used, or the address was taken by another account. Start the change again from Settings.</p>
      </MessagePage>
    );
  if (me?.id !== pending.id)
    return (
      <MessagePage
        icon="lock"
        title="Sign in to confirm"
        actions={
          <Link href="/login" className={PRIMARY}>
            Sign in
          </Link>
        }
      >
        <p>
          Sign in to the FloorTest account that asked for this change (it still uses <span className="text-bone">{masked(pending.email)}</span>) in this browser, then open this link again.
        </p>
        <p>Didn&apos;t ask for this? Ignore it and nothing changes.</p>
      </MessagePage>
    );
  return (
    <form action={confirm}>
      <MessagePage icon="mail" title="Confirm your new email" actions={<button className={PRIMARY}>Confirm new email</button>}>
        <p>
          Make <span className="text-bone">{pending.pending_email}</span> the email for your FloorTest account. You&apos;ll be signed out everywhere and sign in with it next time.
        </p>
      </MessagePage>
    </form>
  );
}
