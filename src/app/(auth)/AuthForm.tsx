"use client";

// The form brings its own field styles, so it looks right outside the (auth) layout too (ops sign-in, 1 Nov).
import "./auth.css";
import { Turnstile } from "@/components/Turnstile";
import { SourceField } from "@/components/SourceField";
import { useActionForm } from "@/components/useActionForm";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { AuthIcon } from "./AuthFrame";
import type { FormState } from "./actions";
import { PasswordStrength } from "@/components/PasswordStrength";
import { browserTimeZone, useBrowserValue } from "@/components/useBrowserValue";

/** Smooth scrolling, unless the person has asked their device for less motion. */
const scrollBehavior = (): ScrollBehavior => (matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth");

type Field = {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  prefix?: string;
  autoComplete?: string;
  inputMode?: "numeric" | "email" | "text";
  defaultValue?: string;
  minLength?: number;
  hint?: React.ReactNode;
  /** New-password field: show the live strength meter. */
  strength?: boolean;
  /** Not required (everything else is). */
  optional?: boolean;
  /** Pick one of these instead of typing. */
  choices?: { value: string; label: string }[];
};

/** Things that arrive (a problem line, the server's answer) settle in from just below; reduced motion keeps the fade. */
const ENTER = "starting:opacity-0 motion-safe:starting:translate-y-1 transition-[opacity,translate] duration-200 ease-[var(--ease-out)]";
const LABEL = "af-lab";
/**
 * A quiet field (owner, 31 Oct; auth.css `af-fld`): 52px, 12px corners, its edge turns bone on focus, no lime ring.
 * The bone edge is the focus mark, for keyboard users too. 16px text, so iPhone Safari doesn't zoom.
 */
const FIELD = "af-fld";

/**
 * One form for every sign-in and sign-up screen. Problems are found here first, one at a time, under the field
 * they belong to, in plain words (the browser's own bubbles never appear). The server's answer, when it has one,
 * sits by the button and comes into view.
 */
export function AuthForm({
  action,
  fields,
  submit,
  footer,
  hidden,
  success,
  botCheckKey,
  captureSource = false,
  consents,
  challengeKey,
  extra,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  fields: Field[];
  submit: string;
  footer?: { text: string; href: string; link: string };
  hidden?: Record<string, string>;
  /** Shown instead of the form once the action returns { ok: true }. */
  success?: React.ReactNode;
  /** Turnstile site key when the bot check is on (sign-up). */
  botCheckKey?: string | null;
  /** Record where the visitor came from (sign-up). */
  captureSource?: boolean;
  /** Tick boxes above the button; required ones must be ticked to submit. */
  consents?: { name: string; label: React.ReactNode; required?: boolean }[];
  /** Turnstile site key for a check that appears only when the server asks (after repeated wrong tries). */
  challengeKey?: string | null;
  /** Quiet actions under the main button (a passkey sign-in). */
  extra?: React.ReactNode;
}) {
  const [state, onSubmit, pending] = useActionForm(action, undefined);
  // The browser's timezone, so digests and dates default to local time.
  const tz = useBrowserValue(browserTimeZone("UTC"), "UTC");
  const [values, setValues] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [issue, setIssue] = useState<{ key: string; text: string } | null>(null);
  const alertRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state?.error) alertRef.current?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
  }, [state?.error]);

  if (state?.ok && success) return <div role="status" className={ENTER}>{success}</div>;

  /** Points at the first thing missing and says what to do. Mirrors what the server will check, so most forms never bounce. */
  function check(form: HTMLFormElement) {
    const fd = new FormData(form);
    const flag = (key: string, text: string) => {
      setIssue({ key, text });
      const el = document.getElementById(`f-${key}`);
      el?.focus({ preventScroll: true });
      el?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
      return false;
    };
    for (const f of fields) {
      const v = String(fd.get(f.name) ?? "").trim();
      if (!v && !f.optional) {
        if (f.choices) return flag(f.name, "Pick one.");
        if (f.type === "email") return flag(f.name, "Enter your email.");
        if (f.type === "password") return flag(f.name, f.autoComplete === "new-password" ? "Choose a password of 8 characters or more." : "Enter your password.");
        if (f.name === "code") return flag(f.name, "Enter the code from the email.");
        return flag(f.name, `Add your ${f.label.toLowerCase()}.`);
      }
      if (v && f.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return flag(f.name, "That doesn't look like an email address.");
      if (v && f.minLength && v.length < f.minLength) return flag(f.name, `At least ${f.minLength} characters.`);
    }
    for (const c of consents ?? []) if (c.required && !fd.get(c.name)) return flag(c.name, "Tick this to continue.");
    return true;
  }

  const problem = (key: string) =>
    issue?.key === key ? (
      <p id={`f-${key}-issue`} role="alert" className={`af-issue ${ENTER}`}>
        {issue.text}
      </p>
    ) : null;
  const invalid = (key: string) => (issue?.key === key ? "af-bad" : "");
  const describe = (f: Field) => (issue?.key === f.name ? `f-${f.name}-issue` : f.hint ? `f-${f.name}-hint` : undefined);

  return (
    <form
      noValidate
      aria-busy={pending}
      onSubmit={(e) => {
        setIssue(null);
        if (!check(e.currentTarget)) return e.preventDefault();
        onSubmit(e);
      }}
      onInput={(e) => {
        const el = e.target as HTMLInputElement;
        if (el.name) {
          setValues((v) => ({ ...v, [el.name]: el.value }));
          if (issue?.key === el.name) setIssue(null);
        }
      }}
      className="af-gap"
    >
      <input type="hidden" name="tz" value={tz} />
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={`f-${f.name}`} className={LABEL}>
            {f.label}
          </label>
          {f.choices ? (
            <div className="relative">
            <select id={`f-${f.name}`} name={f.name} required defaultValue={f.defaultValue ?? ""} aria-invalid={issue?.key === f.name || undefined} aria-describedby={describe(f)} className={`${FIELD} appearance-none pr-10 ${invalid(f.name)}`}>
              <option value="" disabled>
                Choose one
              </option>
              {f.choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <svg aria-hidden viewBox="0 0 24 24" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-mute" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
            </div>
          ) : f.prefix ? (
            <div className={`${FIELD} ${invalid(f.name)}`}>
              <span className="af-pre">{f.prefix}</span>
              <input
                id={`f-${f.name}`}
                name={f.name}
                required
                defaultValue={f.defaultValue}
                placeholder={f.placeholder}
                autoComplete={f.autoComplete}
                autoCapitalize="none"
                aria-invalid={issue?.key === f.name || undefined} aria-describedby={describe(f)}
              />
            </div>
          ) : f.type === "password" ? (
            <div className={`${FIELD} ${invalid(f.name)}`}>
              <input
                id={`f-${f.name}`}
                name={f.name}
                type={shown[f.name] ? "text" : "password"}
                required
                minLength={f.minLength}
                defaultValue={f.defaultValue}
                placeholder={f.placeholder}
                autoComplete={f.autoComplete}
                aria-invalid={issue?.key === f.name || undefined} aria-describedby={describe(f)}
              />
              <button
                type="button"
                onClick={() => setShown((v) => ({ ...v, [f.name]: !v[f.name] }))}
                aria-label={shown[f.name] ? "Hide password" : "Show password"}
                aria-pressed={!!shown[f.name]}
                className="af-eye"
              >
                <AuthIcon name={shown[f.name] ? "eyeOff" : "eye"} />
              </button>
            </div>
          ) : (
            <input
              id={`f-${f.name}`}
              className={`${FIELD} ${invalid(f.name)}`}
              name={f.name}
              type={f.type || "text"}
              inputMode={f.inputMode}
              required={!f.optional}
              minLength={f.minLength}
              defaultValue={f.defaultValue}
              placeholder={f.placeholder}
              autoComplete={f.autoComplete}
              aria-invalid={issue?.key === f.name || undefined} aria-describedby={describe(f)}
            />
          )}
          {f.strength && <div className="af-meter"><PasswordStrength quiet value={values[f.name] ?? ""} context={["name", "email", "handle"].map((k) => values[k] ?? "")} /></div>}
          {problem(f.name)}
          {f.hint && issue?.key !== f.name && (
            <div id={`f-${f.name}-hint`} className="af-note mt-2">
              {f.hint}
            </div>
          )}
        </div>
      ))}
      {consents?.filter((c) => c.required).map((c) => (
        <div key={c.name}>
          <label className="af-cbr">
            <input id={`f-${c.name}`} type="checkbox" name={c.name} required aria-invalid={issue?.key === c.name || undefined} aria-describedby={issue?.key === c.name ? `f-${c.name}-issue` : undefined} />
            <span>{c.label}</span>
          </label>
          {problem(c.name)}
        </div>
      ))}
      {consents?.some((c) => !c.required) && (
        <fieldset className="af-cbs">
          <legend className={`${LABEL} af-opt`}>Emails (optional)</legend>
          {consents.filter((c) => !c.required).map((c) => (
            <label key={c.name} className="af-cbr">
              <input type="checkbox" name={c.name} />
              <span>{c.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      {state?.error && (
        <p ref={alertRef} role="alert" className={`af-alert ${ENTER}`}>
          {state.error}
        </p>
      )}
      {captureSource && <SourceField />}
      <Turnstile action="auth" siteKey={botCheckKey ?? null} />
      {state?.challenge && !botCheckKey && <Turnstile action="auth" key="challenge" siteKey={challengeKey ?? null} eager />}
      <div className="af-ft">
        <button className="af-btn af-prime" disabled={pending}>
          {pending ? "One moment…" : submit}
        </button>
        {extra}
        {footer && (
          <p className="af-row">
            {footer.text}
            <Link href={footer.href}>{footer.link}</Link>
          </p>
        )}
      </div>
    </form>
  );
}
