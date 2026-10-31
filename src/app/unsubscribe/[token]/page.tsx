import Link from "next/link";
import { redirect } from "next/navigation";
import { MessagePage, PRIMARY, SECONDARY } from "@/app/_ui/MessagePage";
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

  if (!t)
    return (
      <MessagePage
        icon="link"
        tone="off"
        title="Link not recognised"
        actions={
          <Link href="/dashboard/settings/notifications" className={PRIMARY}>
            Open Notifications
          </Link>
        }
      >
        <p>It may be from an address that&apos;s no longer on the account. Manage your emails from Notifications in your FloorTest account instead.</p>
      </MessagePage>
    );
  if (done)
    return (
      <MessagePage
        icon="check"
        tone="ok"
        title="You're unsubscribed"
        actions={
          <Link href="/dashboard/settings/notifications" className={SECONDARY}>
            Change email settings
          </Link>
        }
      >
        <p>We won&apos;t send you {UNSUB_KINDS[t.kind].label} any more. You&apos;ll still get emails you need, like sign-in and security notices.</p>
      </MessagePage>
    );
  return (
    <form action={confirm}>
      <MessagePage icon="mail" title={`Stop ${UNSUB_KINDS[t.kind].label}?`} actions={<button className={PRIMARY}>Unsubscribe</button>}>
        <p>You can turn them back on any time from Notifications.</p>
      </MessagePage>
    </form>
  );
}
