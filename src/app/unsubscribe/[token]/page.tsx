import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/Logo";
import { applyUnsubscribe, checkUnsubToken, UNSUB_KINDS } from "@/lib/unsubscribe";

export const metadata = { title: "Unsubscribe — FloorTest", robots: { index: false } };

/** A button rather than acting on open, so link scanners can't unsubscribe people by accident. */
export default async function Unsubscribe({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const done = !!(await searchParams).done;
  const t = await checkUnsubToken(token);

  async function confirm() {
    "use server";
    await applyUnsubscribe(token);
    redirect(`/unsubscribe/${encodeURIComponent(token)}?done=1`);
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
      <Logo className="mb-12" />
      {!t ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight">Link not recognised</h1>
          <p className="mt-3 text-mute">It may be from an address that&apos;s no longer on the account. Manage your emails from Notifications in your FloorTest account instead.</p>
        </>
      ) : done ? (
        <>
          <h1 className="text-3xl font-bold tracking-tight">You&apos;re unsubscribed</h1>
          <p className="mt-3 text-mute">We won&apos;t send you {UNSUB_KINDS[t.kind].label} any more. You&apos;ll still get emails you need, like sign-in and security notices.</p>
          <Link href="/dashboard/notifications" className="btn-ghost mt-8 inline-block">Change email settings</Link>
        </>
      ) : (
        <form action={confirm}>
          <h1 className="text-3xl font-bold tracking-tight">Stop {UNSUB_KINDS[t.kind].label}?</h1>
          <p className="mt-3 text-mute">You can turn them back on any time from Notifications.</p>
          <button className="btn-lime mt-8">Unsubscribe</button>
        </form>
      )}
    </main>
  );
}
