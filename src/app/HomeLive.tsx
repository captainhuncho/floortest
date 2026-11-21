"use client";

/**
 * The home page's moving parts (home 1E, 20 Nov): the warehouse loop in the hero, the link card, the review card, the
 * "What did you play?" ticks, the receipt's Played out tick and the phone claim bar. Sample data only: nothing here
 * reads or sends anything. Styles are in globals.css ("Home 1E"); every piece rests on a finished still, so reduced
 * motion shows a complete page; without JavaScript the loop is the photo alone (it is decoration, hidden from readers).
 */

import { useEffect, useRef, useState } from "react";
import { useClaim } from "./claimName";
import { coverSrc, REVIEW_TRACKS, TRACKS } from "./homeSample";

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Loop timing (spec): one card every 0.7 s, all hold 10 s, fade out over 0.7 s, 1 s of quiet, again. */
const STEP_MS = 700;
const HOLD_MS = 10_000;
const FADE_MS = 700;
const GAP_MS = 1_000;
/** Each card's tilt, in degrees, by position. */
const TILT = [-3, 2, 0, -2, 1, -1, 2, -2, 1, -1, 2];

/** The noise a track gets lost in, landing one message at a time over the warehouse photo. Decorative. */
export function WarehouseLoop({ messages }: { messages: { text: string; mono: boolean }[] }) {
  const [shown, setShown] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const count = messages.length;

  useEffect(() => {
    // Reduced motion: the CSS shows every card at once; no timer runs.
    if (reducedMotion() || !count) return;
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      if (n < count) {
        n += 1;
        setShown(n);
        timer = setTimeout(next, n < count ? STEP_MS : HOLD_MS);
        return;
      }
      setLeaving(true);
      timer = setTimeout(() => {
        n = 0;
        setShown(0);
        setLeaving(false);
        timer = setTimeout(next, 50);
      }, FADE_MS + GAP_MS);
    };
    timer = setTimeout(next, 300);
    return () => clearTimeout(timer);
  }, [count]);

  return (
    <div aria-hidden className="h1e-wh" data-leaving={leaving || undefined}>
      {messages.map((m, i) => (
        <span
          key={`${i}-${m.text}`}
          data-on={i < shown || undefined}
          data-side={i % 2 ? "right" : "left"}
          className={m.mono ? "h1e-wh-mono" : undefined}
          style={{ "--i": i, "--k": i % 3, "--r": `${TILT[i % TILT.length]}deg` } as React.CSSProperties}
        >
          {m.text}
        </span>
      ))}
    </div>
  );
}

/** Runs `onSeen` once, the first time the element is mostly in view. */
function useSeen<T extends Element>(onSeen: () => void, threshold: number) {
  const ref = useRef<T>(null);
  const cb = useRef(onSeen);
  useEffect(() => {
    cb.current = onSeen;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) return cb.current();
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io.disconnect();
        cb.current();
      },
      { threshold },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}

/** One address, and where it opens today. The first time it's in view the link moves from yesterday's row to today's. */
export function LinkCard({ host, label, routeLabel, routes }: { host: string; label: string; routeLabel: string; routes: [string, string][] }) {
  const { name } = useClaim();
  const [picked, setPicked] = useState(0);
  const touched = useRef(false);
  const ref = useSeen<HTMLDivElement>(() => {
    setTimeout(() => !touched.current && setPicked(routes.length - 1), reducedMotion() ? 0 : 700);
  }, 0.7);
  return (
    <div ref={ref} className="rounded-[22px] border border-line bg-ink-3 px-[18px] pb-[18px] pt-5 min-[900px]:max-w-[520px] min-[900px]:px-8 min-[900px]:pb-7 min-[900px]:pt-8">
      <p className="home-label text-[12px] tracking-[0.14em] text-mute">{label}</p>
      <p className="mt-3 truncate text-2xl tracking-[-0.02em] text-mute min-[900px]:text-[34px]">
        {host}/<span className="text-bone">{name || "yourname"}</span>
      </p>
      <p className="mb-3 mt-[18px] border-t border-dashed border-line-2 pt-4 font-mono text-[13px] text-mute">{routeLabel}</p>
      <div role="group" aria-label="Where your link opens">
        {routes.map(([when, where], i) => (
          <button
            key={`${i}-${when}`}
            type="button"
            aria-pressed={picked === i}
            onClick={() => {
              touched.current = true;
              setPicked(i);
            }}
            className="h1e-route mt-2 flex min-h-[52px] w-full items-center justify-between gap-3 rounded-[14px] border px-4 text-left text-[15px]"
          >
            <span>{when}</span>
            <span className="truncate">{where}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/** A waveform with fixed heights (the same on the server and in the browser); the first `played` bars are lit. */
const BARS = Array.from({ length: 44 }, (_, i) => 18 + ((i * 53 + 31 * ((i * 7) % 11)) % 83));
const Wave = ({ played }: { played: number }) => (
  <span aria-hidden className="flex h-9 items-center gap-[2px]">
    {BARS.map((h, i) => (
      <span key={i} className={`flex-1 rounded-[2px] ${i < played ? "bg-bone" : "bg-bone/30"}`} style={{ height: `${h}%` }} />
    ))}
  </span>
);

const Heart = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
    <path d="M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z" />
  </svg>
);
const Cross = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

/** The review card you can try: Keep toggles Kept, Not for me moves to the next track. Each says what the sender sees. */
export function ReviewCard({ hint, kept, unkept, next }: { hint: string; kept: string; unkept: string; next: string }) {
  const [at, setAt] = useState(0);
  const [isKept, setIsKept] = useState(false);
  const [toast, setToast] = useState(hint);
  const [title, artist, bpm, length, cover] = REVIEW_TRACKS[at % REVIEW_TRACKS.length];
  return (
    <div>
      <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-ink-3 p-3.5">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- already a 152 px WebP; the optimizer has nothing to add */}
          <img src={coverSrc(cover)} alt="" width={48} height={48} loading="lazy" decoding="async" draggable={false} className="h1e-cover size-12 shrink-0 rounded-[11px] object-cover" />
          <span className="flex min-w-0 flex-1 flex-col">
            <b className="truncate text-base">{title}</b>
            <span className="truncate text-[13px] text-mute">{artist}</span>
            <span className="tnum font-mono text-[12px] text-mute">
              {bpm} BPM · {length}
            </span>
          </span>
        </div>
        <Wave played={26} />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setIsKept(!isKept);
              setToast(isKept ? unkept : kept);
            }}
            className="h1e-fill inline-flex min-h-12 flex-1 items-center justify-center gap-[7px] whitespace-nowrap rounded-full text-base font-bold"
          >
            <Heart />
            {isKept ? "Kept" : "Keep"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAt(at + 1);
              setIsKept(false);
              setToast(next.replace("{name}", artist.split(" ")[0]));
            }}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-[7px] whitespace-nowrap rounded-full border border-line-2 text-base text-bone hover:border-mute"
          >
            <Cross />
            Not for me
          </button>
        </div>
      </div>
      <p role="status" className="mt-3 min-h-5 text-sm text-mute">
        {toast}
      </p>
    </div>
  );
}

/** After the set: tick what you played. The first is ticked already; each row is one button. */
export function TickList() {
  const [played, setPlayed] = useState([true, false]);
  const rows = [TRACKS[0], TRACKS[2]];
  return (
    <>
      {rows.map(([title, artist, , , cover], i) => (
        <button
          key={title}
          type="button"
          aria-pressed={played[i]}
          aria-label={`Played ${title}`}
          onClick={() => setPlayed(played.map((p, j) => (j === i ? !p : p)))}
          className="h1e-tickrow flex min-h-14 w-full items-center gap-3 border-t border-line text-left"
        >
          <span aria-hidden className="h1e-tick grid size-7 shrink-0 place-items-center rounded-full border">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M5 12l5 5 9-10" />
            </svg>
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element -- already a 152 px WebP; the optimizer has nothing to add */}
          <img src={coverSrc(cover)} alt="" width={38} height={38} loading="lazy" decoding="async" draggable={false} className="h1e-cover size-[38px] shrink-0 rounded-[9px] object-cover" />
          <span className="flex min-w-0 flex-col">
            <b className="truncate text-base">{title}</b>
            <span className="truncate text-[13px] text-mute">{artist}</span>
          </span>
        </button>
      ))}
    </>
  );
}

/** Marks its box `data-lit` the first time it's mostly in view (the receipt's Played out tick fills in then). */
export function LitOnView({ className, children }: { className?: string; children: React.ReactNode }) {
  const [lit, setLit] = useState(false);
  const ref = useSeen<HTMLDivElement>(() => setLit(true), 0.6);
  return (
    <div ref={ref} data-lit={lit || undefined} className={className}>
      {children}
    </div>
  );
}

/**
 * Phones only: the claim bar in the thumb zone. It shows once the hero's claim box has scrolled off the top and hides
 * while the end claim box or the waitlist form is in view (it must never sit on a form). Its button takes you back to
 * the hero's field.
 */
export function ClaimBar({ host }: { host: string }) {
  const { name } = useClaim();
  const [heroGone, setHeroGone] = useState(false);
  const [formSeen, setFormSeen] = useState(false);
  const show = heroGone && !formSeen;

  useEffect(() => {
    if (!("IntersectionObserver" in window)) return;
    const hero = document.querySelector('[data-claim="hero"]');
    const forms = document.querySelectorAll('[data-claim="end"], #waitlist');
    // A batch can hold several entries for one element: the last one is the current state.
    const a = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      setHeroGone(!e.isIntersecting && e.boundingClientRect.top < 0);
    });
    const inView = new Set<Element>();
    const b = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) inView.add(e.target);
        else inView.delete(e.target);
      }
      setFormSeen(inView.size > 0);
    });
    if (hero) a.observe(hero);
    forms.forEach((el) => b.observe(el));
    return () => {
      a.disconnect();
      b.disconnect();
    };
  }, []);

  function toHero() {
    document.getElementById("claim-name")?.focus({ preventScroll: true });
    document.getElementById("hero")?.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
  }

  return (
    <div className="h1e-bar" data-show={show || undefined} aria-hidden={!show}>
      <div className="mx-auto flex max-w-[400px] items-center gap-2.5">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-mute">
          {host}/<span className="text-bone">{name || "yourname"}</span>
        </span>
        <button type="button" tabIndex={show ? 0 : -1} onClick={toHero} className="h1e-fill min-h-[46px] rounded-full px-[18px] text-[15px] font-semibold">
          Claim your link
        </button>
      </div>
    </div>
  );
}
