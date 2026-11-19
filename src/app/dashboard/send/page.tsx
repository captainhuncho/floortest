import { now } from "@/lib/db";
import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireRole, viewingAs } from "@/lib/auth";
import { switchOn } from "@/lib/switches";
import { redirect } from "next/navigation";
import { VerifyBanner } from "../VerifyBanner";
import { sentBy } from "@/lib/sent";
import { APP_URL } from "@/lib/mail";
import { RETAIN_UNREVIEWED_DAYS, unheardAfterWindow } from "@/lib/plans";
import { ago } from "@/lib/format";
import { countsLine, isListened, isWaiting, sendStep } from "@/lib/sent-groups";
import { receiptPath } from "@/lib/receipt-token";
import { Icon } from "@/components/Kit";
import { SentList, type SentRow } from "../../sent/[token]/SentList";
import { SendComposer } from "./SendComposer";
import type { SentBefore } from "./SendLists";

export const metadata = { title: "Send — FloorTest" };

/** How many people Sent to before shows, and how many sends Your latest sends shows (option 58 A). */
const BEFORE_MAX = 3;
const LATEST_MAX = 3;

/**
 * Send your own music to another user's link (option 58 A): who it's for first, then the link page's own form. Beside it
 * (or under it on phones) the people you've sent to before and your latest sends; ?all=1 shows every send.
 */
export default async function Send({ searchParams }: { searchParams: Promise<{ to?: string; all?: string }> }) {
  const user = await requireRole("admin");
  if (!(await switchOn("send_music", user))) redirect("/dashboard/floor");
  await trackUse(user.id, "send");
  const params = await searchParams;
  const to = (params.to || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop()!.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 30);
  // Only this account's own sends (lib/sent: scoped on the server, named columns).
  const [sent, view] = await Promise.all([sentBy(user), viewingAs()]);
  const t = now();

  // What the browser gets for each send: the words a row prints, never the track id, token or the receiver's timestamps.
  const sends: SentRow[] = sent.map((r) => {
    const unheard = unheardAfterWindow(r, t);
    const { label, lit, at } = sendStep(r, unheard, RETAIN_UNREVIEWED_DAYS);
    return {
      href: receiptPath(r),
      title: r.title,
      receiver: r.receiver,
      label,
      lit,
      when: lit ? ago(at, t) : null,
      sentAt: r.created_at,
      listened: isListened(r),
      waiting: isWaiting(r, unheard),
    };
  });

  // Sent to before: the people from your own sends, newest first, once each, with the latest step of your last send to them.
  const before: SentBefore[] = [];
  sent.forEach((r, i) => {
    if (before.length >= BEFORE_MAX || before.some((b) => b.handle === r.handle)) return;
    const s = sends[i];
    before.push({ handle: r.handle, name: r.receiver, label: s.label, lit: s.lit, when: s.when });
  });
  // Your latest sends: only what a row prints.
  const latest = sends.slice(0, LATEST_MAX).map(({ href, title, receiver, label, lit, when }) => ({ href, title, receiver, label, lit, when }));

  const banner = !view && !user.email_verified_at && <VerifyBanner email={user.email} />;

  if (params.all === "1") {
    // The full list, as the Sent history shows it (option 50): grouped by when it was sent, each row opens its receipt.
    return (
      <>
        {banner}
        <div className="page-gutter py-4 sm:py-7">
          <div className="mx-auto flex w-full max-w-2xl min-w-0 flex-col">
            <Link href="/dashboard/send" className="-ml-1 inline-flex min-h-11 w-fit items-center gap-1 rounded-[11px] px-1 text-[13px] text-mute hover:text-bone">
              <Icon name="chev" className="size-4 rotate-180" />
              Send music
            </Link>
            <h1 className="mt-1 text-[22px] font-semibold leading-tight tracking-[-0.025em] text-bone">Everything you&apos;ve sent</h1>
            <p className="tnum mt-1 text-[13px] text-mute">{countsLine(sends)}</p>
            {sends.length ? <SentList rows={sends} now={t} /> : <p className="py-8 text-center text-[13px] text-mute">Nothing sent yet. Each track gets a private receipt.</p>}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {banner}
      <div className="page-gutter py-4 sm:py-7">
        <SendComposer
          host={APP_URL.replace(/^https?:\/\//, "")}
          account={{ name: user.name, email: user.email }}
          initial={to}
          before={before}
          latest={latest}
          total={sends.length}
        />
      </div>
    </>
  );
}
