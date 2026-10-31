"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { Turnstile } from "@/components/Turnstile";
import { SourceField } from "@/components/SourceField";
import { PasswordStrength } from "@/components/PasswordStrength";
import { browserTimeZone, useBrowserValue } from "@/components/useBrowserValue";
import { checkHandle } from "@/app/waitlist/actions";
import { ACCOUNT_TYPES } from "@/lib/account-types";
import {
  EMPTY_ANSWERS,
  HANDLE,
  STORAGE_KEY,
  cleanHandle,
  firstOpenStep,
  fromStored,
  initials,
  progressOf,
  stepForError,
  stepIssue,
  toStored,
  type SignupAnswers,
  type SignupStep,
  type StepIssue,
} from "@/lib/signup-flow";
import { AuthFrame, AuthIcon, CrestMoment, LinkCard, type AuthIconName } from "../AuthFrame";
import { signup, type FormState } from "../actions";

const ROLE_ICONS: Record<string, AuthIconName> = { dj: "head", producer_dj: "wave", ar: "star", label_radio: "radio", artist: "mic", curator: "disc", music_pro: "case" };
const ROLES = Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label, icon: ROLE_ICONS[value] ?? "user" }));
const HANDLE_WAIT_MS = 400;
const AVAIL = {
  free: "Free right now.",
  taken: "Taken. Try another.",
  invalid: "Use 2–30 letters, numbers, - or _.",
  slow: "Too many checks right now. We check again when you create your link.",
} as const;
type Avail = keyof typeof AVAIL;

const stepFromUrl = (v: string | null): SignupStep => {
  const n = Number(v);
  return (n >= 1 && n <= 5 ? Math.floor(n) : 1) as SignupStep;
};

/**
 * Sign-up, one question per screen (owner, 31 Oct): welcome, name, link, role, then email and password. Every field
 * stays mounted in one form (only the current step shows), and "Create my link" posts it once to the same `signup`
 * action with the same field names. The step lives in the URL (?step=), so the phone's Back works; answers live in
 * memory and in sessionStorage, the password only in this component's state.
 */
export function GuidedSignup({
  host,
  botKey,
  hidden,
  lockedEmail,
  canSignUp,
  initialHandle,
  google,
  welcome,
  notice,
  waitlistNote,
  claimTitle,
}: {
  host: string;
  botKey: string | null;
  hidden?: Record<string, string>;
  lockedEmail?: string;
  canSignUp: boolean;
  initialHandle?: string;
  google: boolean;
  welcome: { headline: string; italic: string; intro: string };
  notice?: React.ReactNode;
  waitlistNote?: React.ReactNode;
  claimTitle: React.ReactNode;
}) {
  const params = useSearchParams();
  const step = canSignUp ? stepFromUrl(params.get("step")) : 1;
  const [answers, setAnswers] = useState<SignupAnswers>({ ...EMPTY_ANSWERS, handle: initialHandle ?? "", email: lockedEmail ?? "" });
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [shown, setShown] = useState(false);
  const [issue, setIssue] = useState<StepIssue>(null);
  const [avail, setAvail] = useState<{ handle: string; status: Avail } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [state, formAction, actionPending] = useActionState<FormState, FormData>(signup, undefined);
  const [transitioning, start] = useTransition();
  const pending = actionPending || transitioning;
  const pushed = useRef(0);
  const firstRender = useRef(true);
  const tz = useBrowserValue(browserTimeZone("UTC"), "UTC");

  /** Moves to a step, through the URL so the browser's Back returns to the previous one. */
  function go(next: SignupStep, replace = false) {
    const q = new URLSearchParams(window.location.search);
    if (next === 1) q.delete("step");
    else q.set("step", String(next));
    const url = `${window.location.pathname}${q.size ? `?${q}` : ""}`;
    if (replace) window.history.replaceState(null, "", url);
    else {
      pushed.current += 1;
      window.history.pushState(null, "", url);
    }
    setIssue(null);
  }

  function back() {
    if (pushed.current > 0) {
      pushed.current -= 1;
      window.history.back();
    } else go(Math.max(1, step - 1) as SignupStep, true);
  }

  // Answers from earlier in this visit (a reload, or Back from another page). Never the password.
  useEffect(() => {
    let saved: ReturnType<typeof fromStored> = null;
    try {
      saved = fromStored(sessionStorage.getItem(STORAGE_KEY));
    } catch {}
    const merged = { ...EMPTY_ANSWERS, ...(saved?.answers ?? {}) };
    if (initialHandle && !merged.handle) merged.handle = initialHandle;
    if (lockedEmail) merged.email = lockedEmail;
    // sessionStorage is only readable after hydration, so the restore happens here, once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnswers(merged);
    setLoaded(true);
    // A reload or a link straight to a later step goes back to the first unanswered question.
    const asked = stepFromUrl(new URLSearchParams(window.location.search).get("step"));
    const open = firstOpenStep(merged, asked);
    if (canSignUp && open !== asked) go(open, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on arrival
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, toStored(answers, step));
    } catch {}
  }, [answers, step, loaded]);

  // Each new step's title takes focus, so screen readers announce it (no visible ring for programmatic focus).
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    document.querySelector<HTMLElement>(`[data-step="${step}"] h1`)?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  // Live link check, as on the home page's claim box.
  useEffect(() => {
    const h = answers.handle;
    if (step !== 3 || !HANDLE.test(h)) return;
    let live = true;
    const t = setTimeout(async () => {
      const status = await checkHandle(h).catch(() => "slow" as const);
      if (live) setAvail({ handle: h, status });
    }, HANDLE_WAIT_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [answers.handle, step]);

  // The server's answer lands on the step whose field is wrong (the URL is the outside system here).
  const serverError = state?.error && !pending ? { step: stepForError(state.error), text: state.error } : null;
  useEffect(() => {
    if (!state?.error) return;
    const s = stepForError(state.error);
    if (s !== 5) {
      const q = new URLSearchParams(window.location.search);
      q.set("step", String(s));
      window.history.replaceState(null, "", `${window.location.pathname}?${q}`);
    }
  }, [state]);

  const set = (k: keyof SignupAnswers, v: string | boolean) => {
    setAnswers((a) => ({ ...a, [k]: v }));
    if (issue?.field === k) setIssue(null);
  };

  function flag(found: NonNullable<StepIssue>) {
    setIssue(found);
    const el = document.getElementById(`f-${found.field}`) ?? document.querySelector<HTMLElement>(`[name="${found.field}"]`);
    el?.focus({ preventScroll: true });
    el?.scrollIntoView({ block: "center" });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || step === 1) return;
    const found = stepIssue(step, answers, { password, agree });
    if (found) return flag(found);
    if (step === 3 && avail?.handle === answers.handle && (avail.status === "taken" || avail.status === "invalid"))
      return flag({ field: "handle", text: AVAIL[avail.status] });
    if (step < 5) return go((step + 1) as SignupStep);
    const fd = new FormData(e.currentTarget);
    start(() => formAction(fd));
  }

  const status = step === 3 && avail?.handle === answers.handle ? avail.status : null;
  const describedBy = (field: string) => (issue?.field === field ? `f-${field}-issue` : undefined);
  const problem = (field: string) =>
    issue?.field === field ? (
      <p id={`f-${field}-issue`} role="alert" className="af-issue">
        {issue.text}
      </p>
    ) : null;
  const bad = (field: string) => (issue?.field === field ? " af-bad" : "");
  const serverLine = serverError?.step === step ? (
    <p role="alert" className="af-alert">
      {serverError.text}
    </p>
  ) : null;

  const name = `${answers.first_name} ${answers.last_name}`.trim();
  const aside =
    step === 1 ? (
      <CrestMoment line={welcome.intro.split(/(?<=\.)\s/)[0]} />
    ) : (
      <LinkCard
        label="Your link, so far"
        host={host}
        name={name || undefined}
        handle={answers.handle && HANDLE.test(answers.handle) ? answers.handle : undefined}
        role={ACCOUNT_TYPES[answers.kind as keyof typeof ACCOUNT_TYPES]}
        initials={initials(answers.first_name, answers.last_name)}
      />
    );

  const footer =
    step === 1 ? (
      canSignUp ? (
        <>
          <button type="button" className="af-btn af-prime" onClick={() => go(2)}>
            Claim your link →
          </button>
          <Link href="/login" className="af-btn">
            I already have one
          </Link>
          {google && (
            <p className="af-row">
              Or
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- the route sets up the hand-off to Google */}
              <a href="/api/auth/google">sign up with Google</a>
            </p>
          )}
        </>
      ) : (
        <>
          <Link href="/#waitlist" className="af-btn af-prime">
            Join the waitlist →
          </Link>
          <Link href="/login" className="af-btn">
            I already have one
          </Link>
        </>
      )
    ) : (
      <>
        {serverLine}
        <button className="af-btn af-prime" disabled={pending}>
          {step === 5 ? (pending ? "One moment…" : "Create my link") : "Continue"}
        </button>
      </>
    );

  return (
    <AuthFrame
      step={progressOf(step)}
      back={
        step > 1 ? (
          <button type="button" className="af-back" aria-label="Back" onClick={back}>
            <AuthIcon name="back" />
          </button>
        ) : undefined
      }
      aside={aside}
      footer={footer}
      form={{ noValidate: true, onSubmit, "aria-busy": pending }}
      photo={step === 1}
    >
      <input type="hidden" name="tz" value={tz} />
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <SourceField />
      {step > 1 && <span className="sr-only" aria-live="polite">{`Step ${progressOf(step)} of 7`}</span>}

      <div className="af-step" data-step="1" hidden={step !== 1}>
        <h1 className="af-h af-xl" tabIndex={-1}>
          {welcome.headline}
          <span className="af-ser">{welcome.italic}</span>
        </h1>
        <p className="af-sub">{welcome.intro}</p>
        {canSignUp ? notice && <div className="af-notice">{notice}</div> : <p className="af-notice">{waitlistNote}</p>}
        <noscript>
          <p className="af-notice">Sign-up needs JavaScript for its bot check. Turn it on, then reload this page.</p>
        </noscript>
      </div>

      <div className="af-step" data-step="2" hidden={step !== 2}>
        <h1 className="af-h" tabIndex={-1}>What&apos;s your name?</h1>
        <p className="af-sub">Kept private: for your account, billing and receipts. Never shown on your page.</p>
        <div className="af-gap af-first">
          <div>
            <label htmlFor="f-first_name" className="af-lab">First name</label>
            <input id="f-first_name" name="first_name" className={`af-fld${bad("first_name")}`} value={answers.first_name} onChange={(e) => set("first_name", e.target.value)} autoComplete="given-name" placeholder="Maxwell" maxLength={60} aria-invalid={issue?.field === "first_name" || undefined} aria-describedby={describedBy("first_name")} />
            {problem("first_name")}
          </div>
          <div>
            <label htmlFor="f-last_name" className="af-lab">Surname</label>
            <input id="f-last_name" name="last_name" className={`af-fld${bad("last_name")}`} value={answers.last_name} onChange={(e) => set("last_name", e.target.value)} autoComplete="family-name" placeholder="Adjavon" maxLength={60} aria-invalid={issue?.field === "last_name" || undefined} aria-describedby={describedBy("last_name")} />
            {problem("last_name")}
          </div>
        </div>
      </div>

      <div className="af-step" data-step="3" hidden={step !== 3}>
        <h1 className="af-h" tabIndex={-1}>{claimTitle}</h1>
        <p className="af-sub">Senders use this link to send you music.</p>
        <div className="af-first">
          <label htmlFor="f-handle" className="af-lab">Username</label>
          <div className={`af-fld${bad("handle")}`}>
            <span className="af-pre">{host}/</span>
            <input id="f-handle" name="handle" value={answers.handle} onChange={(e) => set("handle", cleanHandle(e.target.value))} autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="yourname" maxLength={30} aria-invalid={issue?.field === "handle" || undefined} aria-describedby={describedBy("handle") ?? "f-handle-status"} />
          </div>
          {problem("handle") ?? (
            <p id="f-handle-status" role="status" className={`af-avail${status === "free" ? "" : status === "slow" ? " af-wait" : status ? " af-no" : ""}`}>
              {status && (
                <>
                  {status !== "slow" && <AuthIcon name={status === "free" ? "ok" : "no"} />}
                  {AVAIL[status]}
                </>
              )}
            </p>
          )}
        </div>
        <p className="af-note" style={{ marginTop: 16 }}>You can add a stage or label name later in Profile.</p>
      </div>

      <div className="af-step" data-step="4" hidden={step !== 4}>
        <h1 className="af-h" tabIndex={-1}>What best describes you?</h1>
        <p className="af-sub">Pick the closest one.</p>
        <fieldset className="af-rows af-first" aria-describedby={describedBy("kind")}>
          <legend className="sr-only">What best describes you?</legend>
          {ROLES.map((r, i) => (
            <label key={r.value} className="af-role">
              <AuthIcon name={r.icon} className="af-ic" />
              {r.label}
              <span className="af-tk">{answers.kind === r.value && <AuthIcon name="check" />}</span>
              <input type="radio" name="kind" value={r.value} id={i === 0 ? "f-kind" : undefined} checked={answers.kind === r.value} onChange={() => set("kind", r.value)} />
            </label>
          ))}
        </fieldset>
        {problem("kind")}
      </div>

      {/* No pull to refresh on the password step: a refresh would lose the password (kept only in memory). */}
      <div className="af-step" data-step="5" hidden={step !== 5} data-no-pull={step === 5 || undefined}>
        <h1 className="af-h" tabIndex={-1}>Email and password</h1>
        <div className="af-gap af-first">
          <div>
            <label htmlFor="f-email" className="af-lab">Email</label>
            <input id="f-email" name="email" type="email" className={`af-fld${bad("email")}`} value={answers.email} readOnly={!!lockedEmail} onChange={(e) => set("email", e.target.value)} autoComplete="username email" placeholder="you@example.com" maxLength={200} aria-invalid={issue?.field === "email" || undefined} aria-describedby={describedBy("email") ?? (lockedEmail ? "f-email-hint" : undefined)} />
            {problem("email") ?? (lockedEmail && <p id="f-email-hint" className="af-note mt-2">Your invite is for this email.</p>)}
          </div>
          <div>
            <label htmlFor="f-password" className="af-lab">Password</label>
            <div className={`af-fld${bad("password")}`}>
              <input id="f-password" name="password" type={shown ? "text" : "password"} value={password} onChange={(e) => { setPassword(e.target.value); if (issue?.field === "password") setIssue(null); }} autoComplete="new-password" placeholder="8+ characters" minLength={8} maxLength={200} aria-invalid={issue?.field === "password" || undefined} aria-describedby={describedBy("password")} />
              <button type="button" className="af-eye" onClick={() => setShown((v) => !v)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown}>
                <AuthIcon name={shown ? "eyeOff" : "eye"} />
              </button>
            </div>
            <div className="af-meter">
              <PasswordStrength quiet value={password} context={[answers.first_name, answers.last_name, answers.email, answers.handle]} />
            </div>
            {problem("password")}
          </div>
        </div>
        <div className="af-cbs" style={{ marginTop: 8 }}>
          <label className="af-cbr">
            <input id="f-agree" type="checkbox" name="agree" checked={agree} onChange={(e) => { setAgree(e.target.checked); if (issue?.field === "agree") setIssue(null); }} aria-invalid={issue?.field === "agree" || undefined} aria-describedby={describedBy("agree")} />
            <span>
              I&apos;m 18 or over, and I agree to the <a href="/terms" target="_blank">Terms of Use</a> and have read the <a href="/privacy" target="_blank">Privacy Policy</a>.
            </span>
          </label>
          {problem("agree")}
          <span className="af-lab af-opt" id="f-optional">Optional</span>
          <label className="af-cbr">
            <input type="checkbox" name="updates" checked={answers.updates} onChange={(e) => set("updates", e.target.checked)} />
            <span>The FloorTest newsletter: product news and tips</span>
          </label>
          <label className="af-cbr">
            <input type="checkbox" name="offers" checked={answers.offers} onChange={(e) => set("offers", e.target.checked)} />
            <span>Offers and promotions from FloorTest</span>
          </label>
        </div>
        <Turnstile action="auth" siteKey={botKey} />
      </div>
    </AuthFrame>
  );
}
