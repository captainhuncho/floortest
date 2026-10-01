import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { confirmEmailChange, pendingEmailFor } from "@/lib/accounts";
import { audit } from "@/lib/audit";
import { APP_URL, sendMail } from "@/lib/mail";

export const metadata = { title: "Confirm your new email — FloorTest", robots: { index: false } };

/** Needs a click (a POST), so email scanners that pre-open links can't confirm it. */
export default async function ConfirmEmail({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const done = !!(await searchParams).done;
  const pending = done ? null : await pendingEmailFor(token.slice(0, 100));

  async function confirm() {
    "use server";
    const r = await confirmEmailChange(token);
    if (r) {
      await audit(r.id, "settings_updated", "email changed");
      await sendMail({
        userId: r.id,
        audience: "support",
        to: r.from,
        subject: "Your FloorTest email was changed",
        body: `Hi,\n\nThe email on your FloorTest account is now ${r.to.replace(/^(.{2}).*@/, "$1…@")}. You've been signed out on every device.\n\nIf this wasn't you, contact us straight away: ${APP_URL}/contact\n\n— FloorTest`,
      }).catch(() => {});
    }
    redirect(r ? `/confirm-email/${encodeURIComponent(token)}?done=1` : `/confirm-email/${encodeURIComponent(token)}`);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <Logo className="mb-12" />
      {done ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Email changed</h1>
          <p className="mt-3 text-mute">Sign in with your new email. For safety, you&apos;ve been signed out everywhere.</p>
          <Link href="/login" className="btn-lime mt-8 inline-block">Sign in</Link>
        </>
      ) : !pending ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Link not recognised</h1>
          <p className="mt-3 text-mute">This link is invalid, expired, already used, or the address was taken by another account. Start the change again from Settings.</p>
        </>
      ) : (
        <form action={confirm}>
          <h1 className="text-3xl font-bold tracking-tight">Confirm your new email</h1>
          <p className="mt-3 text-mute">
            Make <span className="text-bone">{pending.pending_email}</span> the email for your FloorTest account. You&apos;ll be signed out everywhere and sign in with it next time.
          </p>
          <button className="btn-lime mt-8">Confirm new email</button>
        </form>
      )}
    </main>
  );
}
