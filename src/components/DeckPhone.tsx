/**
 * The deck and the phone: a CDJ jog wheel from above with the Review Queue on a phone rising beside it, drawn from
 * the real UI with sample data. Used on the home page; reusable anywhere (owner, 29 Oct), with PNG exports in
 * public/brand/deck-phone*.png for decks and socials. Motion is plain CSS (globals.css, "Home stage"); every
 * element's resting style is its final frame, so reduced motion shows the still. Decorative: hidden from screen
 * readers, so the page around it carries the words.
 */

const Sample = () => <span className="stage-sample">Sample</span>;

export function DeckPhone({ className = "" }: { className?: string }) {
  return (
    <div className={`relative mx-auto w-full max-w-[440px] ${className}`} aria-hidden>
      <div className="stage-deck relative aspect-square rounded-[2rem] border border-line bg-ink-2 p-[9%]">
        <span className="stage-readout left-[7%] top-[5%]">122.0 BPM</span>
        <span className="stage-readout right-[7%] top-[5%]">−03:41</span>
        <span className="absolute bottom-[4.2%] left-[7%] flex items-center gap-2.5">
          <span className="stage-cue" />
          <span className="text-[10px] tracking-[0.12em] text-faint">CUE</span>
        </span>
        <div className="stage-platter relative size-full overflow-hidden rounded-full">
          <div className="stage-spin absolute inset-0 rounded-full">
            <span className="stage-ticks absolute inset-0 rounded-full" />
            <span className="stage-marker" />
          </div>
          <div className="stage-cap absolute inset-[31%] grid place-items-center rounded-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img draggable={false} src="/brand/crest.svg" alt="" className="w-[46%] opacity-90 grayscale" />
          </div>
        </div>
      </div>
      <div className="stage-rise absolute -bottom-8 -right-2 w-[54%] min-w-[196px] sm:w-[46%] rounded-[1.6rem] border border-line-2 bg-ink p-2 shadow-pop sm:-right-6">
        <PhoneQueue />
      </div>
    </div>
  );
}

const NEXT = [
  ["Lekki Run", "Sample DJ", "113"],
  ["Half Light", "Sample Duo", "124"],
];

/** The Review Queue as it is on phones since 28 Oct: the open track as a card, then what's next. */
function PhoneQueue() {
  return (
    <div className="flex flex-col gap-2 rounded-[1.2rem] border border-line bg-ink p-2.5 pb-3">
      <div className="flex items-baseline justify-between px-0.5">
        <span className="text-[10px] font-bold text-bone">Review Queue</span>
        <span className="font-mono text-[8px] text-faint tnum">1 of 6</span>
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-ink-3 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-bold leading-tight text-bone">Nightbus</p>
            <p className="mt-0.5 truncate text-[8.5px] text-mute">Sample Artist</p>
          </div>
          <span className="flex shrink-0 gap-0.5">
            <Step back />
            <Step />
          </span>
        </div>
        <p className="truncate font-mono text-[7.5px] text-faint tnum">122 BPM · 6:12 · Friday callout</p>
        <Wave />
        <div className="flex items-center gap-1.5">
          <span className="grid size-[18px] place-items-center rounded-[5px] border border-line text-bone">
            <svg viewBox="0 0 24 24" className="size-2" fill="currentColor"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
          </span>
          <span className="font-mono text-[7.5px] text-bone tnum">
            1:48 <span className="text-faint">/ 6:12</span>
          </span>
        </div>
        <div className="grid grid-cols-[1.25fr_1fr_1fr] gap-1 whitespace-nowrap">
          <span className="grid h-6 place-items-center rounded-md border border-line text-[8px] font-bold text-bone">Not for me</span>
          <span className="grid h-6 place-items-center rounded-md bg-lime text-[8px] font-bold text-ink">Keep</span>
          <span className="grid h-6 place-items-center rounded-md border border-line text-[8px] font-bold text-bone">Reply</span>
        </div>
        <p className="text-center text-[7.5px] text-faint">Swipe for the next track</p>
      </div>
      <div className="flex flex-col px-0.5">
        <span className="pb-1 text-[8.5px] font-bold text-mute">Next</span>
        {NEXT.map(([t, a, bpm]) => (
          <span key={t} className="flex items-center gap-1.5 border-t border-line py-1.5">
            <span className="grid size-[14px] shrink-0 place-items-center rounded-[4px] border border-line text-mute">
              <svg viewBox="0 0 24 24" className="size-1.5" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
            </span>
            <span className="min-w-0 flex-1 truncate text-[8.5px] text-bone">
              {t} <span className="text-faint">· {a}</span>
            </span>
            <span className="font-mono text-[7.5px] text-faint tnum">{bpm}</span>
          </span>
        ))}
        <span className="self-end pt-1">
          <Sample />
        </span>
      </div>
    </div>
  );
}

function Step({ back = false }: { back?: boolean }) {
  return (
    <span className={`grid size-4 place-items-center rounded-[4px] border border-line ${back ? "text-faint opacity-50" : "text-bone"}`}>
      <svg viewBox="0 0 24 24" className="size-2" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d={back ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
      </svg>
    </span>
  );
}

/** Fixed heights, so the server and the browser draw the same thing; the first part is played. */
function Wave() {
  const h = [4, 7, 10, 6, 12, 9, 13, 8, 11, 5, 10, 13, 7, 11, 9, 6, 12, 8, 10, 5, 9, 7, 11, 6, 8, 12, 7, 10, 5, 9, 11, 6, 8, 10];
  return (
    <span className="flex h-7 items-center gap-[2px]">
      {h.map((x, i) => (
        <span key={i} className={`flex-1 rounded-full ${i < 10 ? "bg-bone" : "bg-line-2"}`} style={{ height: `${(x / 13) * 100}%` }} />
      ))}
    </span>
  );
}
