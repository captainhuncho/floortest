/**
 * The home page below the hero (home 1E, 20 Nov): one track's week, Sunday to Saturday, then what the sender sees and
 * why it's fair to them. Pictures are drawn from real UI with sample data. No lime on this page: the accent is the
 * text colour (globals.css, "Home 1E"). The wording comes from Site content; the moving parts are in HomeLive.tsx.
 */

import type { editable } from "@/components/Editable";
import { cells, pairs, type Copy } from "@/lib/content-fields";
import { LinkCard, LitOnView, ReviewCard, TickList } from "./HomeLive";
import { coverSrc, TRACKS } from "./homeSample";

/** The home page's wording (Site content) and its on-page editing helpers, from page.tsx. */
export type HomeEd = { c: Copy<"home"> } & ReturnType<typeof editable<Copy<"home">>>;

/** The page's column: phone width up to 900px, then the wide page (globals.css). */
export const COL = "h1e-col";
const TIME = "home-label text-[12px] tracking-[0.08em] text-mute";
const H2 = "text-balance text-[26px] font-semibold leading-[1.1] tracking-[-0.03em] min-[900px]:text-[36px]";
const BODY = "text-mute min-[900px]:text-lg";
const LIST = "rounded-[18px] border border-line bg-ink-3 px-3.5 pb-1.5 pt-1";

/** One day of the week: the words on one side, its picture on the other (swapped on every second day from 900px). */
function Day({ flip = false, words, children }: { flip?: boolean; words: React.ReactNode; children: React.ReactNode }) {
  return (
    <article
      className={`flex flex-col gap-4 border-t border-line py-11 first:border-t-0 min-[900px]:grid min-[900px]:items-center min-[900px]:gap-x-20 min-[900px]:py-[72px] ${
        flip ? "min-[900px]:grid-cols-[6fr_5fr]" : "min-[900px]:grid-cols-[5fr_6fr]"
      }`}
    >
      <div className={`flex flex-col gap-3 min-[900px]:gap-3.5 ${flip ? "min-[900px]:order-2" : ""}`}>{words}</div>
      <div className="min-w-0">{children}</div>
    </article>
  );
}

/** A sample track's cover. The title sits beside it, so the picture says nothing to a screen reader. Below the fold: lazy. */
const Cover = ({ slug }: { slug: string }) => (
  // eslint-disable-next-line @next/next/no-img-element -- already a 152 px WebP; the optimizer has nothing to add
  <img src={coverSrc(slug)} alt="" width={38} height={38} loading="lazy" decoding="async" draggable={false} className="h1e-cover size-[38px] shrink-0 rounded-[9px] object-cover" />
);

/** A list card's heading row, and one track row: cover, title, artist, BPM and length. `fresh` marks a new arrival. */
const ListHead = ({ title, note }: { title: React.ReactNode; note: React.ReactNode }) => (
  <div className="flex items-baseline justify-between gap-3 pb-1.5 pt-2.5">
    <b className="text-[15px]">{title}</b>
    <span className="tnum truncate font-mono text-[12px] text-mute">{note}</span>
  </div>
);
function TrackRow({ track, fresh = false }: { track: (typeof TRACKS)[number]; fresh?: boolean }) {
  const [title, artist, bpm, length, cover] = track;
  return (
    <div className="flex min-h-14 items-center gap-3 border-t border-line">
      <Cover slug={cover} />
      <span className="flex min-w-0 flex-1 flex-col">
        <b className="flex items-center gap-2 text-base">
          <span className="truncate">{title}</span>
          {fresh && (
            <span className="size-[7px] shrink-0 rounded-full bg-current">
              <span className="sr-only">New</span>
            </span>
          )}
        </b>
        <span className="truncate text-[13px] text-mute">{artist}</span>
      </span>
      <span className="tnum whitespace-nowrap font-mono text-[12px] text-mute">
        {bpm} · {length}
      </span>
    </div>
  );
}

/** Sunday to Friday: the link, the queue, the review card and the crate. */
export function Week({ c, E, panel, host }: HomeEd & { host: string }) {
  return (
    <section id="week" aria-label="A week with FloorTest" className={`${COL} scroll-mt-20 pt-7 min-[900px]:pt-10`}>
      <Day
        words={
          <>
            <p className={TIME}><E k="sun_time" /></p>
            <h2 className={H2}><E k="sun_title" /></h2>
            <p className={BODY}><E k="sun_body" /></p>
          </>
        }
      >
        <div {...panel("route_rows", "One row per line: when | where the link opens. Two rows; the second is the one it moves to.")}>
          <LinkCard host={host} label={c.hero_your_link} routeLabel={c.hero_route_label} routes={cells(c.route_rows)} />
        </div>
      </Day>

      <Day
        flip
        words={
          <>
            <p className={TIME}><E k="mon_time" /></p>
            <h2 className={H2}><E k="mon_title" /></h2>
            <p className={BODY}><E k="mon_body" /></p>
          </>
        }
      >
        <div className={LIST}>
          <ListHead title={<E k="queue_title" />} note={<E k="queue_note" />} />
          {TRACKS.slice(0, 4).map((t, i) => (
            <TrackRow key={t[0]} track={t} fresh={i < 3} />
          ))}
        </div>
      </Day>

      <Day
        words={
          <>
            <p className={TIME}><E k="tue_time" /></p>
            <h2 className={H2}><E k="tue_title" /></h2>
            <p className={BODY}><E k="tue_body" /></p>
          </>
        }
      >
        <ReviewCard hint={c.review_hint} kept={c.review_kept} unkept={c.review_unkept} next={c.review_next} />
      </Day>

      <Day
        flip
        words={
          <>
            <p className={TIME}><E k="fri_time" /></p>
            <h2 className={H2}><E k="fri_title" /></h2>
            <p className={BODY}><E k="fri_body" /></p>
          </>
        }
      >
        <div className={LIST}>
          <ListHead title={<E k="crate_title" />} note={<E k="crate_note" />} />
          {[TRACKS[0], TRACKS[2], TRACKS[4]].map((t) => (
            <TrackRow key={t[0]} track={t} />
          ))}
          {/* A picture of the desk's download, not a control: the real one is on the Prepare page. */}
          <p className="h1e-fill mb-2.5 mt-3 flex min-h-10 w-fit items-center gap-2 rounded-full px-4 text-[15px] font-semibold">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
            </svg>
            <E k="crate_button" />
          </p>
        </div>
      </Day>
    </section>
  );
}

/** Saturday night: the booth. This band stays dark in day mode too. */
export function Booth({ E }: HomeEd) {
  return (
    <section aria-labelledby="sat" className="h1e-booth mt-11 pb-10 pt-11 min-[900px]:py-20">
      <div className={`${COL} min-[900px]:grid min-[900px]:grid-cols-[5fr_6fr] min-[900px]:items-start min-[900px]:gap-x-20`}>
        <div className="flex flex-col gap-3">
          <p className={TIME}><E k="sat_time" /></p>
          <h2 id="sat" className={H2}><E k="sat_title" /></h2>
          <p className={BODY}><E k="sat_body" /></p>
        </div>
        <div className={`${LIST} mt-[18px] min-[900px]:mt-0`}>
          <ListHead title={<E k="ticks_title" />} note={<E k="ticks_note" />} />
          <TickList />
        </div>
      </div>
    </section>
  );
}

/** The next morning: the sender's receipt, with Played out filling in as it comes into view. */
export function Thanks({ c, E, panel }: HomeEd) {
  const steps = cells(c.receipt_steps);
  return (
    <section aria-labelledby="thanks" className={`${COL} pt-12 min-[900px]:grid min-[900px]:grid-cols-[5fr_6fr] min-[900px]:items-center min-[900px]:gap-x-20 min-[900px]:pt-[88px]`}>
      <div className="flex flex-col gap-3">
        <p className={TIME}><E k="thanks_time" /></p>
        <h2 id="thanks" className={H2}><E k="thanks_title" /></h2>
        <p className={BODY}><E k="thanks_body" /></p>
      </div>
      <LitOnView className="group mt-[18px] rounded-[18px] border border-line bg-ink-3 px-3.5 pb-1.5 pt-3.5 min-[900px]:mt-0">
        <p className="font-mono text-[12px] text-mute"><E k="receipt_title" /></p>
        <p className="mt-1 text-sm text-mute"><E k="receipt_to" /></p>
        <ul {...panel("receipt_steps", "One step per line: step | when. The last one fills in when the receipt comes into view.")} className="mt-2">
          {steps.map(([step, when], i) => {
            const last = i === steps.length - 1;
            return (
              <li key={`${i}-${step}`} className="flex min-h-[46px] items-center gap-3 border-t border-line">
                <span aria-hidden className={`grid size-6 shrink-0 place-items-center rounded-full border border-line-2 text-[13px] text-mute ${last ? "h1e-played" : ""}`}>
                  ✓
                </span>
                <b className="flex-1 text-[15px] font-semibold">{step}</b>
                <span className={`tnum font-mono text-[12px] text-mute ${last ? "h1e-played-when" : ""}`}>{when}</span>
              </li>
            );
          })}
        </ul>
      </LitOnView>
    </section>
  );
}

/** Why it's fair to the people sending: three plain points. */
export function Fair({ c, E, panel }: HomeEd) {
  return (
    <section aria-labelledby="fair" className={`${COL} pb-2 pt-12 min-[900px]:pt-24`}>
      <h2 id="fair" className="mb-2.5 text-[22px] font-semibold leading-[1.1] tracking-[-0.03em] min-[900px]:text-[36px]"><E k="fair_title" /></h2>
      <dl {...panel("fair_points", "Each point: a title line, then its text. Leave a blank line between points. Three fit best.")} className="min-[900px]:grid min-[900px]:grid-cols-3 min-[900px]:gap-x-10">
        {pairs(c.fair_points).map(([title, body], i) => (
          <div key={`${i}-${title}`} className="grid grid-cols-[28px_1fr] gap-x-3 gap-y-1 border-t border-line py-3.5">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden className="mt-0.5">
              <path d="M5 12l5 5 9-10" />
            </svg>
            <dt className="text-base font-bold">{title}</dt>
            <dd className="col-start-2 text-[15px] text-mute">{body}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
