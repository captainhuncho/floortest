"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

/**
 * When even the root layout fails: the app's styles and fonts aren't there, so this page carries its own (one small
 * style block, system fonts) and copies the one-message look: logo on top, the message centred about 43% down, one
 * lime action, light or dark with the device. A plain reload is the way back (the router may be gone too). The crash
 * still reaches Sentry with its digest; the visitor sees a plain message only, never the error, its code or a stack
 * (owner, 31 Oct, "Hide the stack").
 */
const CSS = `
:root { color-scheme: dark; --ink: #10110f; --card: #171815; --line: #2c2e29; --well: #1e1f1b; --bone: #f1f1eb; --mute: #a3a69b; }
@media (prefers-color-scheme: light) { :root { color-scheme: light; --ink: #fafaf6; --card: #ffffff; --line: #e3e6d8; --well: #f4f5ee; --bone: #0d0e0b; --mute: #4c4f45; } }
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--ink); color: var(--bone); }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.ge { min-height: 100vh; min-height: 100dvh; display: flex; flex-direction: column; padding: max(20px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom)); }
.ge-top { height: 44px; display: flex; align-items: center; justify-content: center; }
.ge-logo { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; color: inherit; text-decoration: none; font-size: 18px; font-weight: 700; letter-spacing: -0.02em; }
.ge-logo img { width: 28px; height: 28px; display: block; pointer-events: none; }
.ge-sp-t { flex: 3 1 0; min-height: 32px; }
.ge-sp-b { flex: 4 1 0; min-height: 32px; }
.ge-box { width: 100%; max-width: 440px; margin: 0 auto; text-align: center; display: flex; flex-direction: column; align-items: center; }
.ge-mark { width: 44px; height: 44px; border-radius: 13px; border: 1px solid var(--line); background: var(--well); color: var(--mute); display: grid; place-items: center; }
h1 { margin: 20px 0 0; font-size: 24px; line-height: 1.15; font-weight: 600; letter-spacing: -0.03em; text-wrap: balance; }
p { margin: 10px 0 0; font-size: 14px; line-height: 1.55; color: var(--mute); text-wrap: pretty; }
p a { color: var(--bone); }
.ge-btn { margin-top: 28px; width: 100%; min-height: 48px; border: 0; border-radius: 13px; background: #d5ff48; color: #10110f; font: inherit; font-size: 14px; font-weight: 700; cursor: pointer; padding: 0 20px; }
.ge-btn:hover { background: #e2ff7a; }
.ge-btn:focus-visible, .ge-logo:focus-visible, p a:focus-visible { outline: 2px solid var(--bone); outline-offset: 3px; }
@media (min-width: 640px) {
  .ge-box { border: 1px solid var(--line); border-radius: 18px; background: var(--card); padding: 40px 36px; }
  .ge-btn { width: auto; min-width: 11rem; }
  h1 { font-size: 28px; }
}
@media (max-height: 499px) { .ge-sp-t, .ge-sp-b { flex: none; } }
`;

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <html lang="en">
      <head>
        <title>This page didn&apos;t load — FloorTest</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <style>{CSS}</style>
      </head>
      <body>
        <main className="ge">
          <div className="ge-top">
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the whole app failed, so the router may be gone: a plain link and image are the safest */}
            <a href="/" className="ge-logo">
              {/* eslint-disable-next-line @next/next/no-img-element -- the crest is an SVG; Next's image optimizer doesn't process SVGs */}
              <img draggable={false} src="/brand/crest.svg" alt="" aria-hidden />
              FloorTest
            </a>
          </div>
          <div className="ge-sp-t" aria-hidden />
          <section className="ge-box">
            <span className="ge-mark" aria-hidden>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </span>
            <h1>This page didn&apos;t load</h1>
            <p>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the router may be gone: a plain link */}
              Reload the page. If it keeps happening, <a href="/contact">contact us</a>.
            </p>
            <button type="button" className="ge-btn" onClick={() => window.location.reload()}>
              Reload
            </button>
          </section>
          <div className="ge-sp-b" aria-hidden />
        </main>
      </body>
    </html>
  );
}
