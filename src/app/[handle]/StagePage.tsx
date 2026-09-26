import type { Collection, User } from "@/lib/db";
import { fmtDay } from "@/lib/format";
import { genresFor, MAX_UPLOAD_BYTES, RETAIN_UNREVIEWED_DAYS } from "@/lib/plans";
import { mono, serif } from "../fonts";
import { StageForm } from "./StageForm";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

const shortDay = (ts: number) => new Date(ts).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

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
  const cover = receiver.cover_file ? `/api/cover/${receiver.handle}?v=${encodeURIComponent(receiver.cover_file)}` : null;
  const range = collection?.bpm_min && collection?.bpm_max ? `${collection.bpm_min}–${collection.bpm_max} BPM` : null;
  const genres = genresFor(collection);
  // "Wanted" defaults to the collection's own genre list when no custom brief is written.
  const wanted = collection?.brief_wanted || (genres.custom ? genres.list.join(" · ") : "");
  const brief = [
    wanted && { k: "Wanted", v: wanted },
    range && { k: "Range", v: range },
    collection?.closes_at && { k: "Deadline", v: `Open until ${shortDay(collection.closes_at)}` },
  ].filter(Boolean) as { k: string; v: string }[];

  return (
    <div className={`${serif.variable} ${mono.variable} stage relative min-h-dvh overflow-clip bg-[#120d0a] text-bone`}>
      {/* Atmosphere: a blurred wash of the cover everywhere, the sharp photo in the middle. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        {cover ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={cover} alt="" className="absolute inset-0 h-full w-full scale-125 object-cover opacity-50 blur-3xl" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cover}
              alt=""
              className="absolute inset-x-0 top-0 h-[58vh] w-full object-cover object-top [mask-image:linear-gradient(to_bottom,black_55%,transparent)] lg:inset-y-0 lg:left-1/2 lg:h-full lg:w-[min(44vw,760px)] lg:-translate-x-1/2 lg:[mask-image:linear-gradient(to_right,transparent,black_18%,black_82%,transparent)]"
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_30%,#6b3f14_0%,transparent_70%),radial-gradient(40%_40%_at_80%_90%,#2b3a0a_0%,transparent_70%)]" />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_40%,rgba(10,7,5,0.85)_100%)]" />
      </div>

      <main className="relative z-10 mx-auto grid min-h-dvh max-w-[1600px] gap-6 px-4 pb-8 pt-[34vh] sm:px-8 lg:grid-cols-[minmax(0,500px)_1fr_minmax(0,640px)] lg:items-start lg:gap-8 lg:py-10">
        {/* Receiver card: first on phones so the sender knows where they are. */}
        <section
          aria-labelledby="stage-h"
          className="stage-panel order-1 rounded-3xl p-6 sm:p-8 lg:sticky lg:top-10 lg:order-3 lg:col-start-3 lg:mt-[18vh]"
        >
          <header className="flex items-center gap-4 border-b border-white/10 pb-6">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-bone text-lg font-bold text-ink" aria-hidden>
              {initials(receiver.name)}
            </span>
            <div className="min-w-0">
              <p className="stage-label">Private submission link for</p>
              <p className="truncate text-lg font-semibold">{receiver.name}</p>
              <p className="stage-label truncate">
                {receiver.role_line ? `${receiver.role_line} · ` : ""}@{receiver.handle}
              </p>
            </div>
          </header>

          <p className="stage-label mt-7 flex items-center gap-3 text-lime">
            <span aria-hidden className="h-px w-10 bg-lime" />[{accepting ? "Now accepting unreleased music" : "Not accepting right now"}]
          </p>
          <h1 id="stage-h" className="mt-5 text-[clamp(2.75rem,5.4vw,5.25rem)] font-bold leading-[0.92] tracking-[-0.035em]">
            Send the demo.
            <span className="block font-[family-name:var(--font-serif)] text-[1.08em] font-normal italic tracking-[-0.02em]">
              See what happens.
            </span>
          </h1>
          <p className="mt-6 max-w-xl text-[17px] leading-relaxed text-[#d8cfc4]">
            Upload the actual WAV or MP3 straight into {first}&apos;s current collection. No streaming links and no profile needed.
            {" "}
            {first} downloads the original when they&apos;re ready to play it.
          </p>

          {collection && (
            <div className="mt-7 flex items-center gap-4 rounded-2xl border border-white/10 bg-black/25 p-5">
              <svg aria-hidden viewBox="0 0 32 24" className="h-7 w-9 shrink-0 text-[#d8cfc4]" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="1" y="3" width="30" height="20" rx="2" />
                <path d="M1 8h30" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="stage-label">Current destination</p>
                <p className="truncate text-xl font-semibold">{collection.name}</p>
                <p className="stage-label normal-case tracking-normal">Chosen by {first} · your file lands here automatically</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 font-[family-name:var(--font-stage-mono)] text-xs font-medium uppercase ${
                  accepting ? "bg-lime text-ink" : "bg-white/10 text-[#d8cfc4]"
                }`}
              >
                {accepting ? "Open" : "Closed"}
              </span>
            </div>
          )}

          {(brief.length > 0 || collection?.brief_note) && (
            <dl className="mt-4 overflow-hidden rounded-2xl border border-white/10">
              {brief.length > 0 && (
                <div className={`grid divide-white/10 sm:divide-x ${brief.length === 3 ? "sm:grid-cols-3" : brief.length === 2 ? "sm:grid-cols-2" : ""}`}>
                  {brief.map((b) => (
                    <div key={b.k} className="border-b border-white/10 p-4 sm:border-b-0">
                      <dt className="stage-label">{b.k}</dt>
                      <dd className="mt-1.5 font-[family-name:var(--font-stage-mono)] text-sm leading-snug">{b.v}</dd>
                    </div>
                  ))}
                </div>
              )}
              {collection?.brief_note && (
                <div className={`p-4 ${brief.length ? "border-t border-white/10" : ""}`}>
                  <dt className="sr-only">Brief</dt>
                  <dd className="font-[family-name:var(--font-stage-mono)] text-sm text-[#d8cfc4]">{collection.brief_note}</dd>
                </div>
              )}
            </dl>
          )}
        </section>

        <section aria-label="Submission" className="stage-panel order-2 rounded-3xl p-6 sm:p-8 lg:order-1 lg:col-start-1 lg:row-start-1">
          {accepting ? (
            <StageForm
              handle={receiver.handle}
              receiverName={receiver.name}
              collectionName={collection?.name ?? null}
              bpmRange={collection?.bpm_min && collection?.bpm_max ? [collection.bpm_min, collection.bpm_max] : null}
              genres={genres.list}
              maxMb={Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}
              retentionDays={RETAIN_UNREVIEWED_DAYS}
            />
          ) : (
            <div role="status">
              <p className="stage-label">Submissions paused</p>
              <p className="mt-3 text-2xl font-semibold">{closedReason}</p>
              {note && <p className="mt-4 whitespace-pre-wrap border-l-2 border-lime pl-4 text-bone">{note}</p>}
              <p className="mt-3 text-[#d8cfc4]">This link stays the same. Check back when {first} is taking music again.</p>
              {collection?.closes_at && <p className="stage-label mt-6">Closed {fmtDay(collection.closes_at)}</p>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
