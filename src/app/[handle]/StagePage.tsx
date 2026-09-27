import type { Collection, User } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { genresFor, MAX_UPLOAD_BYTES, RETAIN_UNREVIEWED_DAYS } from "@/lib/plans";
import { mono, serif } from "../fonts";
import { SubmitForm } from "./SubmitForm";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

const shortDay = (ts: number, timeZone: string) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone });

/** The "Stage" public page: an atmospheric, photo-led take on the receiver link. */
export function StagePage({
  receiver,
  collection,
  accepting,
  closedReason,
  note,
}: {
  receiver: User;
  collection: Collection | undefined;
  accepting: boolean;
  closedReason: string | null;
  note?: string;
}) {
  const first = receiver.name.split(/\s+/)[0];
  const cover = receiver.cover_key ? `/api/cover/${receiver.handle}?v=${encodeURIComponent(receiver.cover_key)}` : null;
  const range = collection?.bpm_min && collection?.bpm_max ? `${collection.bpm_min}–${collection.bpm_max} BPM` : null;
  const genres = genresFor(collection);
  // "Wanted" defaults to the collection's own genre list when no custom brief is written.
  const wanted = collection?.brief_wanted || (genres.custom ? genres.list.join(" · ") : "");
  const brief = [
    wanted && { k: "Wanted", v: wanted },
    range && { k: "Range", v: range },
    collection?.closes_at && { k: "Deadline", v: `Open until ${shortDay(collection.closes_at, receiver.tz)}` },
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <div className={`${serif.variable} ${mono.variable} stage relative min-h-dvh overflow-clip bg-[#120d0a] text-bone`}>
      {/* Atmosphere: a blurred wash of the cover, or warm light when there isn't one. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-45 blur-3xl" />
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_20%,#6b3f14_0%,transparent_70%),radial-gradient(40%_40%_at_80%_90%,#2b3a0a_0%,transparent_70%)]" />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_30%,transparent_35%,rgba(10,7,5,0.9)_100%)]" />
      </div>

      <main className="relative z-10 mx-auto w-full max-w-[540px] px-4 py-8 sm:py-14">
        <section aria-labelledby="stage-h" className="stage-panel rounded-3xl p-5 sm:p-7">
          <header className="flex items-center gap-3.5">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-bone font-bold text-ink" aria-hidden>
                {initials(receiver.name)}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">
                {receiver.name}
                {receiver.identity_status === "verified" && (
                  <span title="Verified by FloorTest" className="ml-1.5 text-lime" aria-label="Verified">
                    ✓
                  </span>
                )}
              </p>
              <p className="stage-label truncate">
                {receiver.role_line ? `${receiver.role_line} · ` : ""}@{receiver.handle}
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 font-[family-name:var(--font-stage-mono)] text-[11px] font-medium uppercase ${
                accepting ? "bg-lime text-ink" : "border border-white/15 text-[#bdb1a3]"
              }`}
            >
              {accepting ? "Open" : "Paused"}
            </span>
          </header>

          <h1 id="stage-h" className="mt-6 text-[clamp(1.9rem,6vw,2.6rem)] font-bold leading-[0.95] tracking-[-0.03em]">
            Send the demo.
            <span className="block font-[family-name:var(--font-serif)] text-[1.08em] font-normal italic tracking-[-0.02em]">
              See what happens.
            </span>
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-[#d8cfc4]">
            The original WAV or MP3, straight to {first}. No links, no account.
          </p>

          {collection && (
            <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 px-4 py-3">
              <p className="stage-label">Sending to</p>
              <p className="truncate font-semibold">{collection.name}</p>
              {(brief.length > 0 || collection.brief_note) && (
                <p className="mt-1 font-[family-name:var(--font-stage-mono)] text-xs leading-relaxed text-[#bdb1a3]">
                  {[...brief.map((b) => b.v), collection.brief_note].filter(Boolean).join(" · ")}
                </p>
              )}
            </div>
          )}

          <div className="mt-6">
            {accepting ? (
              <SubmitForm handle={receiver.handle} receiverName={first} genres={genres.list} look="stage" />
            ) : (
              <div role="status" className="rounded-2xl border border-white/10 bg-black/25 p-5">
                <p className="stage-label">Submissions paused</p>
                <p className="mt-2 text-xl font-semibold">{closedReason}</p>
                {note && <p className="mt-3 whitespace-pre-wrap border-l-2 border-lime pl-4">{note}</p>}
                <p className="mt-2 text-[#d8cfc4]">This link stays the same. Check back when {first} is taking music again.</p>
                {collection?.closes_at && <p className="stage-label mt-4">Closed {fmtDay(collection.closes_at, receiver.tz)}</p>}
              </div>
            )}
          </div>
        </section>
        <p className="stage-label mt-5 text-center">
          Kept private · unreviewed tracks deleted after {RETAIN_UNREVIEWED_DAYS} days · max {Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB
          {receiver.identity_status !== "verified" && (
            <>
              {" · "}
              <a href={`/contact?report=${receiver.handle}`} className="underline underline-offset-4 hover:text-bone">
                report impersonation
              </a>
            </>
          )}
        </p>
      </main>
    </div>
  );
}
