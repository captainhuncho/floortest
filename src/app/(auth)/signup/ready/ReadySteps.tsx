"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { STORAGE_KEY, initials } from "@/lib/signup-flow";
import { useBrowserValue } from "@/components/useBrowserValue";
import { AuthFrame, AuthIcon, LinkCard } from "../../AuthFrame";

type Screen = 6 | 7 | 8;
/** The same cap as POST /api/cover; checked here first so a big photo doesn't upload only to be refused. */
const MAX_PHOTO = 8 * 1024 * 1024;
const COPIED_MS = 2000;

/**
 * Steps 6 to 8 of the guided sign-up, after the account exists: check your email (the link the signup action sent;
 * nobody has to wait for it), add a photo through the Settings upload (POST /api/cover, skippable), and the link,
 * ready to copy or share. No Back: the account is made.
 */
export function ReadySteps({
  host,
  origin,
  firstName,
  lastName,
  handle,
  email,
  verified,
  role,
  cover,
}: {
  host: string;
  origin: string;
  firstName: string;
  lastName: string;
  handle: string;
  email: string;
  verified: boolean;
  role?: string;
  cover: string | null;
}) {
  // An invite's code proved the email already, so there's nothing to check.
  const [screen, setScreen] = useState<Screen>(verified ? 7 : 6);
  const [picked, setPicked] = useState<{ file: File; url: string } | null>(null);
  const [photo, setPhoto] = useState<string | null>(cover);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const canShare = useBrowserValue(() => typeof navigator.share === "function", false);
  const first = useRef(true);
  const choose = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const link = `${origin}/${handle}`;

  // The account exists: the answers kept for the form aren't needed any more.
  useEffect(() => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    document.querySelector<HTMLElement>(".af-blk h1")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [screen]);

  useEffect(() => () => {
    if (picked) URL.revokeObjectURL(picked.url);
  }, [picked]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setProblem(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setProblem("Use a JPG, PNG or WebP image.");
    if (file.size > MAX_PHOTO) return setProblem("Images must be under 8 MB.");
    setPicked({ file, url: URL.createObjectURL(file) });
  }

  async function upload() {
    if (!picked || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      const fd = new FormData();
      fd.append("file", picked.file);
      const r = await fetch("/api/cover", { method: "POST", body: fd });
      if (!r.ok) {
        const body = (await r.json().catch(() => null)) as { error?: string } | null;
        return setProblem(body?.error ?? "That photo didn't upload. Try again, or skip for now.");
      }
      setPhoto(picked.url);
      setScreen(8);
    } catch {
      setProblem("That photo didn't upload. Check your connection and try again, or skip for now.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setProblem(`Copy this link: ${link}`);
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Send me your music", url: link });
    } catch {
      // Closing the share sheet is not a problem.
    }
  }

  const shownPhoto = screen === 7 ? (picked?.url ?? photo) : photo;
  const aside = (
    <LinkCard
      label={screen === 8 ? "Your link is live" : "Your link, so far"}
      host={host}
      name={`${firstName} ${lastName}`.trim()}
      role={role}
      handle={handle}
      photo={shownPhoto}
      initials={initials(firstName, lastName)}
    />
  );
  const alert = problem && (
    <p role="alert" className="af-alert">
      {problem}
    </p>
  );

  if (screen === 6)
    return (
      <AuthFrame step={5} aside={aside} footer={<button type="button" className="af-btn af-prime" onClick={() => setScreen(7)}>Continue</button>}>
        <h1 className="af-h" tabIndex={-1}>Check your email</h1>
        <p className="af-sub">
          We sent a link to <b className="text-bone">{email}</b>. Tap it to confirm your email. You can carry on now.
        </p>
        <p className="af-note af-first">Until it&apos;s confirmed, you can receive tracks but not send them from this account.</p>
      </AuthFrame>
    );

  if (screen === 7)
    return (
      <AuthFrame
        step={6}
        aside={aside}
        footer={
          <>
            {alert}
            <button type="button" className={`af-btn ${picked ? "af-prime" : "af-off"}`} disabled={!picked || busy} onClick={upload}>
              {busy ? "Uploading…" : "Continue"}
            </button>
            <button type="button" className="af-btn" onClick={() => setScreen(8)}>
              Skip for now
            </button>
          </>
        }
      >
        <h1 className="af-h" tabIndex={-1}>Add your photo</h1>
        <p className="af-sub">It sits next to your name on your link, so senders know they&apos;ve found you.</p>
        <div className={`af-pic${shownPhoto ? " af-done" : ""}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:) or the cover route */}
          {shownPhoto ? <img src={shownPhoto} alt="Your photo" /> : (
            <span className="af-ph">
              <AuthIcon name="user" />
              Square works best
            </span>
          )}
        </div>
        <input ref={camera} className="af-file" type="file" accept="image/jpeg,image/png,image/webp" capture="user" tabIndex={-1} aria-hidden onChange={onPick} />
        <input ref={choose} className="af-file" type="file" accept="image/jpeg,image/png,image/webp" tabIndex={-1} aria-hidden onChange={onPick} />
        <div className="af-duo af-solo" style={{ marginTop: 16 }}>
          <button type="button" className="af-btn af-sm af-phone-only" onClick={() => camera.current?.click()}>
            <AuthIcon name="cam" />
            Take a photo
          </button>
          <button type="button" className="af-btn af-sm" onClick={() => choose.current?.click()}>
            <AuthIcon name="img" />
            <span className="af-phone-only">{picked ? "Choose another" : "Choose one"}</span>
            <span className="af-wide-only">{picked ? "Choose another" : "Choose a photo"}</span>
          </button>
        </div>
      </AuthFrame>
    );

  return (
    <AuthFrame step={7} center photo aside={aside} footer={<Link href="/dashboard/floor?welcome=1" className="af-btn af-prime">Go to your desk</Link>}>
      {photo && (
        <div className="af-pic af-small af-done">
          {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob:) or the cover route */}
          <img src={photo} alt="" />
        </div>
      )}
      <h1 className="af-h" tabIndex={-1}>Your link is ready.</h1>
      <p className="af-sub">Share it anywhere. Every track sent to it lands on your desk.</p>
      <div className="af-handle af-first">
        {host}/<b>{handle}</b>
      </div>
      <div className={`af-duo${canShare ? "" : " af-solo-all"}`} style={{ width: "100%", marginTop: 8 }}>
        <button type="button" className="af-btn af-sm" onClick={copy}>
          <AuthIcon name={copied ? "check" : "copy"} />
          {copied ? "Copied" : "Copy link"}
        </button>
        {canShare && (
          <button type="button" className="af-btn af-sm af-phone-only" onClick={share}>
            <AuthIcon name="share" />
            Share
          </button>
        )}
      </div>
      {alert}
      <span className="sr-only" aria-live="polite">{copied ? "Link copied" : ""}</span>
    </AuthFrame>
  );
}
