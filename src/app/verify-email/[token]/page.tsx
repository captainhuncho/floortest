import Link from "next/link";
import { redirect } from "next/navigation";
import { MessagePage, PRIMARY } from "@/app/_ui/MessagePage";
import { q } from "@/lib/db";
import { sendWelcome } from "@/lib/onboarding";
import { currentPerson } from "@/lib/auth";
import { hashToken } from "@/lib/token-hash";
import { confirmEmail } from "@/lib/accounts";

export const metadata = { title: "Confirm your email — FloorTest", robots: { index: false } };

/** Needs a click (a POST), so email scanners that pre-open links can't confirm it for you. */
export default async function VerifyEmail({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const done = !!(await searchParams).done;
  const pending = done ? null : await q.get<{ id: number; email: string }>("SELECT id, email FROM users WHERE email_verify_token = ?", hashToken(token.slice(0, 100)));
  const me = await currentPerson();

  async function confirm() {
    "use server";
    const ok = await confirmEmail(token, (await currentPerson())?.id ?? null);
    if (ok) await sendWelcome(ok.id);
    redirect(ok ? `/verify-email/${encodeURIComponent(token)}?done=1` : `/verify-email/${encodeURIComponent(token)}`);
  }

  if (done)
    return (
      <MessagePage
        icon="check"
        tone="ok"
        title="Email confirmed"
        actions={
          <Link href="/dashboard/floor" className={PRIMARY}>
            Open your desk
          </Link>
        }
      >
        <p>Password resets and alerts will reach you here.</p>
      </MessagePage>
    );
  if (!pending)
    return (
      <MessagePage
        icon="link"
        tone="off"
        title="Link not recognised"
        actions={
          <Link href="/dashboard/floor" className={PRIMARY}>
            Open your desk
          </Link>
        }
      >
        <p>This link is invalid, already used, or was replaced by a newer one. You can send a fresh one from your desk.</p>
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
          Sign in to the FloorTest account for <span className="text-bone">{pending.email}</span> in this browser, then open this link again.
        </p>
        <p>Didn&apos;t make this account? Sign in with an email code instead: it confirms the address and signs out whoever made it.</p>
      </MessagePage>
    );
  return (
    <form action={confirm}>
      <MessagePage icon="mail" title="Confirm your email" actions={<button className={PRIMARY}>Confirm my email</button>}>
        <p>
          Confirm <span className="text-bone">{pending.email}</span> belongs to you.
        </p>
      </MessagePage>
    </form>
  );
}
