"use client";

import { Turnstile } from "@/components/Turnstile";
import { SourceField } from "@/components/SourceField";
import { useActionForm } from "@/components/useActionForm";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { NavIcon } from "@/components/NavIcon";
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
const LABEL = "text-[11px] font-bold uppercase tracking-[0.5px] text-dim";

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
      <p id={`f-${key}-issue`} role="alert" className={`text-[12px] text-danger ${ENTER}`}>
        {issue.text}
      </p>
    ) : null;
  const invalid = (key: string) => (issue?.key === key ? "border-danger/60" : "");
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
      className="flex flex-col gap-5"
    >
      <input type="hidden" name="tz" value={tz} />
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <label htmlFor={`f-${f.name}`} className={LABEL}>
            {f.label}
          </label>
          {f.choices ? (
            <select id={`f-${f.name}`} name={f.name} required defaultValue={f.defaultValue ?? ""} aria-invalid={issue?.key === f.name || undefined} aria-describedby={describe(f)} className={`input ${invalid(f.name)}`}>
              <option value="" disabled>
                Choose one
              </option>
              {f.choices.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          ) : f.prefix ? (
            <div className={`flex items-stretch overflow-hidden rounded-lg border bg-ink-2 focus-within:border-lime/70 ${issue?.key === f.name ? "border-danger/60" : "border-line"}`}>
              <span className="flex shrink-0 items-center pl-3 text-sm text-mute">{f.prefix}</span>
              <input
                id={`f-${f.name}`}
                name={f.name}
                required
                defaultValue={f.defaultValue}
                placeholder={f.placeholder}
                autoComplete={f.autoComplete}
                autoCapitalize="none"
                aria-invalid={issue?.key === f.name || undefined} aria-describedby={describe(f)}
                className="tap-tall w-full min-w-0 bg-transparent py-2.5 pr-3 text-sm outline-none placeholder:text-dim"
              />
            </div>
          ) : f.type === "password" ? (
            <div className="relative">
              <input
                id={`f-${f.name}`}
                className={`input pr-12 ${invalid(f.name)}`}
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
                className="absolute inset-y-0 right-0 grid w-12 place-items-center text-mute hover:text-bone"
              >
                <NavIcon name={shown[f.name] ? "eyeOff" : "eye"} className="size-[18px]" />
              </button>
            </div>
          ) : (
            <input
              id={`f-${f.name}`}
              className={`input ${invalid(f.name)}`}
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
          {f.strength && <PasswordStrength value={values[f.name] ?? ""} context={["name", "email", "handle"].map((k) => values[k] ?? "")} />}
          {problem(f.name)}
          {f.hint && issue?.key !== f.name && (
            <div id={`f-${f.name}-hint`} className="text-[12px] text-dim">
              {f.hint}
            </div>
          )}
        </div>
      ))}
      {consents?.filter((c) => c.required).map((c) => (
        <div key={c.name} className="flex flex-col gap-1.5">
          <label className="tap-tall flex cursor-pointer items-start gap-3 text-[13px] text-mute">
            <input id={`f-${c.name}`} type="checkbox" name={c.name} required aria-invalid={issue?.key === c.name || undefined} aria-describedby={issue?.key === c.name ? `f-${c.name}-issue` : undefined} className="mt-0.5 size-5 shrink-0 accent-lime" />
            <span>{c.label}</span>
          </label>
          {problem(c.name)}
        </div>
      ))}
      {consents?.some((c) => !c.required) && (
        <fieldset className="flex flex-col gap-1">
          <legend className={`${LABEL} mb-1.5`}>Emails (optional)</legend>
          {consents.filter((c) => !c.required).map((c) => (
            <label key={c.name} className="tap-tall flex cursor-pointer items-start gap-3 py-1 text-[13px] text-mute">
              <input type="checkbox" name={c.name} className="mt-0.5 size-5 shrink-0 accent-lime" />
              <span>{c.label}</span>
            </label>
          ))}
        </fieldset>
      )}
      {state?.error && (
        <p ref={alertRef} role="alert" className={`rounded-lg border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-[13px] text-danger ${ENTER}`}>
          {state.error}
        </p>
      )}
      {captureSource && <SourceField />}
      <Turnstile action="auth" siteKey={botCheckKey ?? null} />
      {state?.challenge && !botCheckKey && <Turnstile action="auth" key="challenge" siteKey={challengeKey ?? null} eager />}
      <button className="btn-lime min-h-11 w-full text-[14px] font-bold" disabled={pending}>
        {pending ? "One moment…" : submit}
      </button>
      {footer && (
        <p className="text-center text-[13px] text-mute">
          {footer.text}{" "}
          <Link href={footer.href} className="text-bone underline underline-offset-4">
            {footer.link}
          </Link>
        </p>
      )}
    </form>
  );
}
