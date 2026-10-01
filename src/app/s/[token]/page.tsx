import { notFound } from "next/navigation";
import { Logo } from "@/components/Logo";
import { fmtDay } from "@/lib/format";
import { shareDownloadEnabled } from "@/lib/plans";
import { shareByToken } from "@/lib/share";

export const metadata = { title: "Shared track — FloorTest", robots: { index: false, follow: false } };

/** A colleague's listen-only page: the track, a player, no download button. */
export default async function SharedTrack({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const s = await shareByToken(token);
  if (!s) notFound();
  const download = shareDownloadEnabled(s.receiver_plan);
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 bg-ink px-5 py-8 font-[family-name:var(--font-stage-mono)] text-bone">
      <Logo />
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[1px] text-faint">Shared with you by {s.receiver}</p>
        <h1 className="mt-2 break-words text-[28px] font-bold tracking-[-0.8px]">{s.title}</h1>
        <p className="text-[12px] text-mute">{s.artist}</p>
      </div>
      <section className="rounded-2xl border border-line bg-ink-3 p-4">
        {/* controlsList hides the browser's own download option; this is a listening copy, not a file to keep. */}
        <audio controls controlsList="nodownload noplaybackrate" preload="none" src={`/api/share/${token}/audio`} className="w-full" />
        {download && (
          <a href={`/api/share/${token}/download`} className="mt-3 block rounded-md bg-lime px-3 py-2.5 text-center text-[12px] font-bold text-ink">
            Download the original
          </a>
        )}
      </section>
      <p className="text-[11px] leading-[1.6] text-faint">
        {download
          ? "This is an unreleased track, shared privately with you. You can play it in your sets, but don't pass it on or release it anywhere."
          : "This is an unreleased track, shared privately for you to listen to. Please don't download, record or pass it on."}{" "}
        The link stops working on {fmtDay(s.expires_at)}.
      </p>
    </main>
  );
}
