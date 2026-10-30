import { now } from "@/lib/db";
import { trackUse } from "@/lib/usage";
import Link from "next/link";
import { requireRole, viewingAs } from "@/lib/auth";
import { switchOn } from "@/lib/switches";
import { redirect } from "next/navigation";
import { VerifyBanner } from "../VerifyBanner";
import { sentBy } from "@/lib/sent";
import { APP_URL } from "@/lib/mail";
import { unheardAfterWindow } from "@/lib/plans";
import { SendComposer } from "./SendComposer";
import { CARD, Chip, Icon, PageHead, SectionHead } from "@/components/Kit";

export const metadata = { title: "Send — FloorTest" };

/** Send your own music to another user's link, and see what happened to everything you've sent. */
export default async function Send({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  const user = await requireRole("admin");
  if (!(await switchOn("send_music", user))) redirect("/dashboard/floor");
  await trackUse(user.id, "send");
  const to = ((await searchParams).to || "").trim().replace(/[?#].*$/, "").replace(/\/+$/, "").split("/").pop()!.replace(/^@/, "").toLowerCase().replace(/[^a-z0-9-_]/g, "").slice(0, 30);
  const [sent, view] = await Promise.all([sentBy(user), viewingAs()]);
  type Sent = (typeof sent)[number];
  const t = now();
  const ago = (ms: number) => {
    const m = Math.max(1, Math.floor((t - ms) / 60_000));
    return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
  };
  // The most recent thing that happened, in words.
  const latest = (r: Sent) => {
    const ev = ([["Played out", r.played_out_at], ["Replied", r.replied_at], ["Downloaded", r.downloaded_at], ["Listened", r.played_at]] as const).filter(([, at]) => at).sort((x, y) => Number(y[1]) - Number(x[1]))[0];
    if (ev) return `${ev[0]} ${ago(Number(ev[1]))}`;
    return unheardAfterWindow(r, t) ? "Not listened to in 90 days" : `Delivered ${ago(r.created_at)} · not played yet`;
  };

  // Lime from delivery on, like the receipt; a track unheard for 90 days stays dim.
  const lit = (r: Sent) => !!r.played_at || !unheardAfterWindow(r, t);

  // The last 10 days stay open; anything older folds under "Older than 10 days".
  const cutoff = now() - 10 * 86_400_000;
  const recent = sent.filter((r) => Number(r.created_at) >= cutoff);
  const older = sent.filter((r) => Number(r.created_at) < cutoff);
  // This week's sends, for the count beside the list's title.
  const week = sent.filter((r) => Number(r.created_at) >= t - 7 * 86_400_000).length;
  const row = (r: Sent) => (
    <li key={r.token} className="border-t border-line first:border-t-0">
      <Link
        href={`/receipt/${r.token}`}
        className="group/row -mx-1.5 flex min-h-11 items-center gap-2 rounded-[11px] px-1.5 py-2.5 hover:bg-well focus-visible:bg-well focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-lime active:bg-well"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-bone">
            {r.artist} - {r.title}
          </span>
          <span className="block truncate text-[11.5px] text-mute">
            to {r.receiver} <span className="font-mono text-[11px]">/{r.handle}</span> · {new Date(r.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
          </span>
          <span className={`mt-1 flex items-center gap-1.5 text-[11px] ${lit(r) ? "font-semibold text-bone" : "text-faint"}`}>
            <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${lit(r) ? "bg-lime" : "border border-line-2"}`} />
            {latest(r)}
          </span>
        </span>
        <span className="sr-only">Track</span>
        <span aria-hidden className="text-mute transition-transform group-hover/row:translate-x-0.5 group-hover/row:text-bone motion-reduce:transition-none">
          <Icon name="chev" className="size-4" />
        </span>
      </Link>
    </li>
  );

  return (
    <>
    {!view && !user.email_verified_at && <VerifyBanner email={user.email} />}
    {/*
      One column on phones and tablets: who it's for, the send form, then what you've sent. From 1280px the sending
      sits on the left and the Sent list on the right, like the mock.
    */}
    <div className="page-gutter py-4 sm:py-7">
      <div className="mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-4 sm:gap-5 xl:max-w-6xl">
        <PageHead label="Send a track to anyone with a FloorTest link." title="Send" />
        <div className="grid min-w-0 items-start gap-4 sm:gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="min-w-0">
            <SendComposer host={APP_URL.replace(/^https?:\/\//, "")} account={{ name: user.name, email: user.email }} initial={to} />
          </div>

          <section aria-labelledby="sent-h" className={`${CARD} flex min-w-0 flex-col gap-1.5 p-3`}>
            <SectionHead id="sent-h" icon="send" title={`Sent (${sent.length})`} aside={week > 0 ? <span className="tnum">{week} this week</span> : undefined} />
            {sent.length ? (
              <>
                <p className="text-[11.5px] text-mute">Each send gets a private receipt. Tap one to see what&apos;s happened.</p>
                <ul className="mt-1">
                  {recent.map(row)}
                  {!recent.length && <li className="py-3 text-[12px] text-mute">Nothing sent in the last 10 days.</li>}
                </ul>
              </>
            ) : (
              <>
                <p className="text-[11.5px] text-mute">Nothing sent yet. Each track gets a private receipt.</p>
                {/* A sample row, faint and labelled, so the receipt's ladder is clear before there's a real one. */}
                <figure className="mt-2 rounded-[13px] border border-dashed border-line-2 p-3 text-faint">
                  <figcaption className="sr-only">Sample receipt</figcaption>
                  <p className="flex items-baseline justify-between gap-4">
                    <span className="min-w-0 truncate text-[12.5px]">Sample Artist - Nightbus (demo)</span>
                    <Chip>Sample</Chip>
                  </p>
                  <ol aria-label="What a receipt can say, in order" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                    {["Delivered", "Listened", "Downloaded", "Replied", "Played out"].map((s, i) => (
                      <li key={s} className="flex items-center gap-2">
                        {i > 0 && <span aria-hidden>→</span>}
                        <span className="flex items-center gap-1.5">
                          {/* A receipt starts lit: Delivered is the lime light until something happens. */}
                          <span aria-hidden className={`size-1.5 rounded-full ${i === 0 ? "bg-lime" : "border border-current"}`} />
                          {s}
                        </span>
                      </li>
                    ))}
                  </ol>
                </figure>
              </>
            )}
            {older.length > 0 && (
              // Sends over 10 days old fold away so the page stays short; open it to see them.
              <details className="group mt-1.5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-[11px] border border-line bg-well px-3 text-[12.5px] font-semibold text-bone hover:bg-ink-4 [&::-webkit-details-marker]:hidden">
                  <span>Older than 10 days</span>
                  <span className="flex items-center gap-2">
                    <span className="tnum"><Chip>{older.length}</Chip></span>
                    <span aria-hidden className="text-mute transition-transform group-open:rotate-90 motion-reduce:transition-none">
                      <Icon name="chev" className="size-4" />
                    </span>
                  </span>
                </summary>
                <ul className="mt-1">{older.map(row)}</ul>
              </details>
            )}
          </section>
        </div>
      </div>
    </div>
    </>
  );
}
