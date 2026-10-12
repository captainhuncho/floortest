/**
 * The home page's pictures, drawn from real UI with sample data (rollout brief, 12 Oct): the jog wheel at 2am,
 * and the two sides of the desk. One lime light per picture. Motion is plain CSS
 * (globals.css, "Home stage"); every element's resting style is its final frame, so reduced motion shows the still.
 */

const Sample = () => <span className="stage-sample">Sample</span>;

/** A CDJ jog wheel from above: the platter turns, the crest stays still in the centre cap, one cue light. */
export function JogWheel() {
  return (
    <div className="relative mx-auto w-full max-w-[440px]" aria-hidden>
      <div className="stage-deck relative aspect-square rounded-[2rem] border border-line bg-ink-2 p-[9%]">
        <span className="stage-readout left-[7%] top-[5%]">122.0 BPM</span>
        <span className="stage-readout right-[7%] top-[5%]">−03:41</span>
        <span className="absolute bottom-[4.2%] left-[7%] flex items-center gap-3.5">
          <span className="stage-cue" />
          <span className="stage-readout static">CUE</span>
        </span>
        <div className="stage-platter relative size-full rounded-full">
          <div className="stage-spin absolute inset-0 rounded-full">
            <span className="stage-ticks absolute inset-0 rounded-full" />
            <span className="stage-marker" />
          </div>
          <div className="stage-cap absolute inset-[31%] grid place-items-center rounded-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/crest.svg" alt="" className="w-[46%] opacity-90 grayscale" />
          </div>
        </div>
      </div>
      <PhoneQueue />
    </div>
  );
}

const QUEUE = [
  ["Nightbus (demo)", "Sample Artist", "122", "6:12"],
  ["Lekki Run", "Sample Producer", "113", "5:40"],
  ["Half Light", "Sample Duo", "124", "7:03"],
];

/** The phone rising beside the deck: the Review Queue, first row playing. */
function PhoneQueue() {
  return (
    <div className="stage-rise absolute -bottom-8 -right-2 w-[46%] min-w-[168px] rounded-[1.6rem] border border-line-2 bg-ink p-2 shadow-pop sm:-right-6">
      <div className="rounded-[1.2rem] border border-line bg-ink-2 px-3 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-mute">Review</span>
          <span className="tnum text-[10px] text-faint">3 waiting</span>
        </div>
        <ul className="mt-3 space-y-1.5">
          {QUEUE.map(([t, a, bpm], i) => (
            <li key={t} className={`rounded-md border px-2 py-1.5 ${i ? "border-line" : "border-line-2 bg-ink-3"}`}>
              <p className="truncate text-[10px] font-bold text-bone">{t}</p>
              <p className="tnum truncate text-[9px] text-faint">{a} · {bpm}</p>
              {!i && <Bars className="mt-1.5 h-3" />}
            </li>
          ))}
        </ul>
        <div className="mt-2.5 grid grid-cols-2 gap-1.5 text-center text-[9px] font-bold uppercase">
          <span className="rounded border border-line-2 py-1.5 text-bone">Keep</span>
          <span className="rounded border border-line py-1.5 text-mute">Not for me</span>
        </div>
        <p className="mt-2 text-right"><Sample /></p>
      </div>
    </div>
  );
}

/** A small waveform: fixed heights, so the server and the browser draw the same thing. */
function Bars({ className = "" }: { className?: string }) {
  const h = [3, 6, 9, 5, 11, 8, 12, 7, 10, 4, 9, 12, 6, 10, 8, 5, 11, 7, 9, 4, 8, 6, 10, 5];
  return (
    <span className={`flex items-end gap-[2px] ${className}`}>
      {h.map((x, i) => (
        <span key={i} className={`w-[2px] rounded-full ${i < 9 ? "bg-bone" : "bg-line-2"}`} style={{ height: `${(x / 12) * 100}%` }} />
      ))}
    </span>
  );
}

const SIGNALS = ["Delivered", "Listened", "Downloaded", "Replied", "Played out"];

/** The receiver's laptop and the sender's phone, side by side, in front of the booth neon. */
export function TwoSides() {
  return (
    <section className="relative overflow-hidden border-y border-line bg-ink-2">
      <p aria-hidden className="stage-neon">send me music</p>
      <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <h2 className="text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[0.95] tracking-[-0.04em]">Two sides of one desk.</h2>
        <p className="mt-4 max-w-xl text-sm text-mute">You decide. The sender knows what happened, and nothing more.</p>
        <div className="mt-12 grid grid-cols-1 items-end gap-10 lg:grid-cols-[minmax(0,1fr)_260px]">
          <figure className="stage-fill min-w-0">
            <div className="rounded-t-xl border border-line-2 bg-ink p-2 pb-0">
              <div className="rounded-t-md border border-line bg-ink-2 p-4 sm:p-5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-mute">Review Queue</span>
                  <Sample />
                </div>
                <ul className="mt-4 divide-y divide-line border-y border-line text-xs">
                  {[...QUEUE, ["Ọjọ́ Ẹtì", "Adéṣọlá Sample", "112", "6:48"]].map(([t, a, bpm, len], i) => (
                    <li key={t} className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto_auto] ${i ? "" : "bg-ink-3 px-3 -mx-3"}`}>
                      <span className="min-w-0">
                        <span className="block truncate font-bold text-bone">{t}</span>
                        <span className="block truncate text-faint">{a}</span>
                      </span>
                      <span className="hidden sm:block">{i ? null : <Bars className="h-4" />}</span>
                      <span className="tnum hidden text-faint sm:block">{bpm} BPM</span>
                      <span className="tnum text-faint">{len}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex gap-2 text-[11px] font-bold uppercase">
                  <span className="rounded-md border border-line-2 px-4 py-2 text-bone">Keep · K</span>
                  <span className="rounded-md border border-line px-4 py-2 text-mute">Not for me · X</span>
                </div>
              </div>
            </div>
            <div className="mx-[-3%] h-3 rounded-b-xl border border-line-2 bg-ink-3" />
            <figcaption className="mt-4 text-xs text-faint">The DJ&apos;s desk</figcaption>
          </figure>
          <figure className="stage-fill stage-fill-late mx-auto w-full max-w-[260px]">
            <div className="rounded-[2rem] border border-line-2 bg-ink p-2.5">
              <div className="rounded-[1.5rem] border border-line bg-ink-2 px-4 pb-5 pt-6">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-mute">Private receipt</span>
                  <Sample />
                </div>
                <p className="mt-4 text-base font-bold leading-tight text-bone">Sample DJ listened.</p>
                <p className="tnum mt-1 text-[11px] text-faint">10 Oct, 01:12</p>
                <p className="mt-3 truncate text-[11px] text-mute">Nightbus (demo) · Sample Artist</p>
                <ol className="mt-4 space-y-2.5 border-t border-line pt-4 text-[11px]">
                  {SIGNALS.map((s, i) => (
                    <li key={s} className={`flex items-center gap-2.5 ${i === 1 ? "stage-tick" : ""} ${i < 2 ? "text-bone" : "text-faint"}`}>
                      <span className={`size-2 rounded-full ${i < 2 ? "bg-bone" : "border border-line-2"}`} />
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <figcaption className="mt-4 text-center text-xs text-faint">The sender&apos;s phone</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}

const LOG: [string, string, string, string | null][] = [
  ["Tue 18:00", "Callout open", "120–124 BPM · Afro house · closes Fri", "Reads your brief"],
  ["Wed 21:40", "Lands in Up next", "Sent from a studio in Lagos", "Delivered"],
  ["Thu 00:12", "30 seconds in", "Real playback, nothing less", "Listened"],
  ["Thu 00:13", "Keep", "Your crew stars it for Saturday", null],
  ["Sat 19:30", "Into the crate", "Folder, M3U8 and Rekordbox XML", "Downloaded"],
  ["Sun 01:12", "On the floor", "You tap Played out", "Played out"],
];

/** The features as one track's week, set out like a set log: what happens on the desk, and what crosses to the sender. */
export function SetLog() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
      <h2 className="text-[clamp(2.25rem,5vw,4rem)] font-bold leading-[0.95] tracking-[-0.04em]">Sent Wednesday. Played Sunday.</h2>
      <div className="mt-10 border-t border-line">
        <p className="flex items-center justify-between gap-4 py-4 text-xs">
          <span className="tnum truncate text-mute">Nightbus (demo) · Sample Artist · 122 BPM</span>
          <Sample />
        </p>
        <div className="hidden grid-cols-[7rem_minmax(0,1fr)_14rem] gap-6 border-y border-line py-2 text-[10px] uppercase tracking-[0.12em] text-faint sm:grid">
          <span>Time</span>
          <span>Your desk</span>
          <span>The sender sees</span>
        </div>
        <ol>
          {LOG.map(([time, what, detail, sender], i) => (
            <li key={time} className="stage-log grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 border-b border-line py-5 sm:grid-cols-[7rem_minmax(0,1fr)_14rem] sm:gap-6">
              <span className="tnum pt-0.5 text-xs text-faint">{time}</span>
              <span className="min-w-0">
                <span className="block text-base font-bold text-bone">{what}</span>
                <span className="mt-1 block text-xs text-mute">{detail}</span>
              </span>
              <span className={`col-start-2 text-xs sm:col-start-auto sm:pt-1 ${sender ? (i === LOG.length - 1 ? "text-lime" : "text-bone") : "text-faint"}`}>
                <span className="mr-2 text-faint sm:hidden">Sender:</span>
                {sender ?? "Nothing. Your call stays private."}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
