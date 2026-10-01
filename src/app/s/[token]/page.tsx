import Link from "next/link";
import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { currentUser } from "@/lib/auth";
import { fmtDay } from "@/lib/format";
import { shareByToken } from "@/lib/share";

export const metadata = { title: "Shared track — FloorTest", robots: { index: false, follow: false } };

/**
 * A colleague's page for a shared track. Colleagues need a FloorTest account, so everyone who hears or
 * downloads it has agreed to the Terms. Downloads only if the receiver's plan allowed it when the track was sent.
 */
export default async function SharedTrack({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await shareByToken(token);
  if (!s) notFound();
  const user = await currentUser();
  const download = !!s.share_download;

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 bg-ink px-5 py-8 font-[family-name:var(--font-stage-mono)] text-bone">
      <Logo />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[1px] text-faint">Shared with you by {s.receiver}</p>
        <h1 className="mt-2 break-words text-[28px] font-bold tracking-[-0.8px]">{s.title}</h1>
        <p className="text-[12px] text-mute">{s.artist}</p>
      </div>

      {user ? (
        <section className="rounded-2xl border border-line bg-ink-3 p-4">
          {/* No download option in the player itself; downloads, when allowed, go through the button below. */}
          <audio controls controlsList="nodownload noplaybackrate" preload="none" src={`/api/share/${token}/audio`} className="w-full" />
          {download && (
            <a href={`/api/share/${token}/download`} className="mt-3 block rounded-md bg-lime px-3 py-2.5 text-center text-[12px] font-bold text-ink">
              Download the original
            </a>
          )}
        </section>
      ) : (
        <section className="flex flex-col gap-3 rounded-2xl border border-line bg-ink-3 p-4">
          <p className="text-[13px] font-bold">Sign in to listen</p>
          <p className="text-[11px] leading-[1.6] text-mute">
            Shared tracks are only for FloorTest members, so every listener has agreed to the same rules as {s.receiver}. Joining is free, and this link
            works as your invite.
          </p>
          <div className="flex gap-2">
            <Link href={`/api/share/${token}/join?to=signup`} className="flex-1 rounded-md bg-lime px-3 py-2.5 text-center text-[12px] font-bold text-ink">
              Join FloorTest
            </Link>
            <Link href={`/api/share/${token}/join?to=login`} className="flex-1 rounded-md border border-line px-3 py-2.5 text-center text-[12px] font-bold hover:border-mute">
              Log in
            </Link>
          </div>
        </section>
      )}

      <p className="text-[11px] leading-[1.6] text-faint">
        This is an unreleased track, shared with you for promotion and to play in your DJ sets.{" "}
        {download ? "You can download it for that. " : "It's for listening only. "}
        Don&apos;t pass it on, and never release it commercially without a signed agreement with the artist. {s.receiver} can see who listened
        {download ? " and downloaded" : ""}. The link stops working on {fmtDay(s.expires_at)}.
      </p>
    </main>
  );
}
