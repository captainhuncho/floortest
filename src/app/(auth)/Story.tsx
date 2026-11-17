"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Logo } from "@/components/Logo";
import { AuthIcon } from "./AuthFrame";
import { StoryScene } from "./StoryScene";
import { STORY_END, type Chapter } from "./chapters";

/** A press shorter than this on the scene moves on; a longer one only holds the story still. */
const HOLD_MS = 280;

/**
 * The story's bars: one per chapter, the current one filling. The fill is a CSS animation (auth.css `st-fill`) that
 * only runs when the device allows motion, and its end is what moves the story on, so with Reduce Motion nothing
 * moves and chapters change only on a tap or a key.
 */
function StoryBars({ count, at, onDone }: { count: number; at: number; onDone: () => void }) {
  return (
    <div className="st-bars" aria-hidden>
      {Array.from({ length: count }, (_, i) => (
        <i key={i} className={i < at ? "st-done" : i === at ? "st-on" : ""}>
          <b onAnimationEnd={i === at ? onDone : undefined} />
        </i>
      ))}
    </div>
  );
}

function PauseButton({ paused, onToggle }: { paused: boolean; onToggle: () => void }) {
  return (
    <button type="button" className="st-pause" aria-label={paused ? "Play the story" : "Pause the story"} onClick={onToggle}>
      <svg aria-hidden viewBox="0 0 24 24" fill="currentColor">
        {paused ? <path d="M8 5.5v13l11-6.5z" /> : <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />}
      </svg>
    </button>
  );
}

/**
 * Step 1 of /signup (owner, 17 Nov, option 54): the welcome story, then the end card, the only place that asks.
 * Phones: bars, the example, the words, Next. Desktop: the words on glass at the left, the example over the photo at
 * the right. Next, Skip to the end, the arrow keys and Space (pause) drive it; a tap on the example moves on and a
 * hold pauses. `at` lives with the caller, so coming back from step 2 returns to the end card.
 */
export function Welcome({
  chapters,
  at,
  onAt,
  host,
  canSignUp,
  google,
  notice,
  waitlistNote,
  onClaim,
}: {
  chapters: readonly Chapter[];
  at: number;
  onAt: (next: (at: number) => number) => void;
  host: string;
  canSignUp: boolean;
  google: boolean;
  notice?: React.ReactNode;
  waitlistNote?: React.ReactNode;
  onClaim: () => void;
}) {
  const count = chapters.length;
  const end = at >= count;
  const [stopped, setStopped] = useState(false);
  const [held, setHeld] = useState(false);
  const [keep, setKeep] = useState<boolean | null>(null);
  const pressedAt = useRef(0);
  const paused = stopped || held;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (e.key === "ArrowRight") onAt((a) => Math.min(a + 1, count));
      else if (e.key === "ArrowLeft") onAt((a) => Math.max(a - 1, 0));
      else if (e.key === " " && !t?.closest("button, a")) {
        e.preventDefault();
        setStopped((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, onAt]);

  const next = () => onAt((a) => Math.min(a + 1, count));
  const release = (moveOn: boolean) => (e: React.PointerEvent) => {
    if (!pressedAt.current) return;
    const quick = e.timeStamp - pressedAt.current < HOLD_MS;
    pressedAt.current = 0;
    setHeld(false);
    if (moveOn && quick) next();
  };
  const chapter = end ? STORY_END : chapters[at];

  return (
    <div className={`aw${end ? " aw-end" : ""}${at === 0 || end ? " aw-photo" : ""}${paused ? " st-paused" : ""}`} data-step="1">
      <header className="aw-top">
        <Logo className="af-logo" />
        {!end && <span className="aw-ex aw-ex-top">Example</span>}
        <span className="aw-have">
          <span className="aw-q">Already have a link?</span>
          <Link href="/login" className="aw-login">
            Log in
          </Link>
        </span>
      </header>
      <div className="aw-grid">
        <section className="aw-glass" aria-label="What FloorTest does">
          {!end && <p className="aw-ex aw-ex-in">Example</p>}
          <div className="aw-barrow">
            <StoryBars count={count} at={at} onDone={next} />
            {!end && <PauseButton paused={stopped} onToggle={() => setStopped((v) => !v)} />}
          </div>
          <div className="aw-cap" aria-live="polite" aria-atomic="true">
            <div key={at} className="aw-fade">
              <h1 className="aw-h" tabIndex={-1}>
                {chapter.title}
              </h1>
              <p className="aw-line">{chapter.line}</p>
            </div>
          </div>
          {end && (
            <div className="aw-ask">
              <div className="sc-link sc-big ag-card" aria-hidden>
                <span className="sc-av">
                  <AuthIcon name="user" />
                </span>
                <span className="sc-lm">
                  <span className="sc-url">
                    {host}/<b>yourname</b>
                  </span>
                  <span className="sc-sm">Your role</span>
                </span>
              </div>
              {canSignUp ? notice && <div className="af-notice">{notice}</div> : <p className="af-notice">{waitlistNote}</p>}
            </div>
          )}
          <noscript>
            <p className="af-notice">Sign-up needs JavaScript for its bot check. Turn it on, then reload this page.</p>
          </noscript>
          {end ? (
            <div className="aw-btns">
              {canSignUp ? (
                <button type="button" className="af-btn af-prime" onClick={onClaim}>
                  Claim your link
                </button>
              ) : (
                <Link href="/#waitlist" className="af-btn af-prime">
                  Join the waitlist
                </Link>
              )}
              <Link href="/login" className="af-btn aw-alt">
                I already have one
              </Link>
              {canSignUp && google && (
                <p className="af-row">
                  Or
                  {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the route sets up the hand-off to Google */}
                  <a href="/api/auth/google">sign up with Google</a>
                </p>
              )}
            </div>
          ) : (
            <div className="aw-btns">
              <button type="button" className="af-btn aw-alt aw-next" onClick={next}>
                Next
              </button>
              <button type="button" className="aw-skip" onClick={() => onAt(() => count)}>
                Skip to the end
              </button>
            </div>
          )}
          {!end && (
            <p className="aw-keys" aria-hidden>
              <kbd>←</kbd> <kbd>→</kbd> move · <kbd>Space</kbd> pause
            </p>
          )}
        </section>
        {!end && (
          <div
            className="aw-scene"
            onPointerDown={(e) => {
              if ((e.target as Element).closest("button, a")) return;
              pressedAt.current = e.timeStamp;
              setHeld(true);
            }}
            onPointerUp={release(true)}
            onPointerCancel={release(false)}
            onPointerLeave={release(false)}
          >
            <div key={at} className="aw-fade">
              <StoryScene chapter={at} host={host} keep={keep} onKeep={setKeep} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Desktop log in: the story as a quiet caption at the foot of the photo, turning over on its own (or held still). */
export function StoryCaption({ chapters }: { chapters: readonly Chapter[] }) {
  const [at, setAt] = useState(0);
  const [stopped, setStopped] = useState(false);
  const chapter = chapters[at];
  return (
    <div className={`st-cap${stopped ? " st-paused" : ""}`}>
      <div className="aw-barrow">
        <StoryBars count={chapters.length} at={at} onDone={() => setAt((a) => (a + 1) % chapters.length)} />
        <PauseButton paused={stopped} onToggle={() => setStopped((v) => !v)} />
      </div>
      <div key={at} className="aw-fade">
        <p className="st-cap-h">{chapter.title}</p>
        <p className="st-cap-line">{chapter.line}</p>
      </div>
    </div>
  );
}
