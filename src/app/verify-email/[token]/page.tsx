import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
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

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <Logo className="mb-12" />
      {done ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Email confirmed</h1>
          <p className="mt-3 text-mute">Password resets and alerts will reach you here.</p>
          <Link href="/dashboard/floor" className="btn-lime mt-8 inline-block">
            Open your desk
          </Link>
        </>
      ) : !pending ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Link not recognised</h1>
          <p className="mt-3 text-mute">This link is invalid, already used, or was replaced by a newer one. You can send a fresh one from your desk.</p>
        </>
      ) : me?.id !== pending.id ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Sign in to confirm</h1>
          <p className="mt-3 text-mute">
            Sign in to the FloorTest account for <span className="text-bone">{pending.email}</span> in this browser, then open this link again.
          </p>
          <p className="mt-3 text-mute">
            Didn&apos;t make this account? Sign in with an email code instead: it confirms the address and signs out whoever made it.
          </p>
          <Link href="/login" className="btn-lime mt-8 inline-block">
            Sign in
          </Link>
        </>
      ) : (
        <form action={confirm}>
          <h1 className="text-3xl font-bold tracking-tight">Confirm your email</h1>
          <p className="mt-3 text-mute">
            Confirm <span className="text-bone">{pending.email}</span> belongs to you.
          </p>
          <button className="btn-lime mt-8">Confirm my email</button>
        </form>
      )}
    </main>
  );
}
