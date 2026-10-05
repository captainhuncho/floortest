"use client";

import { Turnstile } from "@/components/Turnstile";
import { SourceField } from "@/components/SourceField";
import { useActionForm } from "@/components/useActionForm";
import Link from "next/link";
import { useEffect, useState } from "react";
import { NavIcon } from "@/components/NavIcon";
import type { FormState } from "./actions";
import { PasswordStrength } from "@/components/PasswordStrength";

type Field = {
  name: string;
  label: string;
  type?: string;
  placeholder?: string;
  prefix?: string;
  autoComplete?: string;
  defaultValue?: string;
  minLength?: number;
  hint?: React.ReactNode;
  /** New-password field: show the live strength meter. */
  strength?: boolean;
  /** Pick one of these instead of typing. */
  choices?: { value: string; label: string }[];
};

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
}) {
  const [state, onSubmit, pending] = useActionForm(action, undefined);
  const [tz, setTz] = useState("UTC");
  const [values, setValues] = useState<Record<string, string>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  // The browser's timezone, so digests and dates default to local time.
  useEffect(() => setTz(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"), []);

  if (state?.ok && success) return <div role="status">{success}</div>;

  return (
    <form
      onSubmit={onSubmit}
      onInput={(e) => {
        const el = e.target as HTMLInputElement;
        if (el.name) setValues((v) => ({ ...v, [el.name]: el.value }));
      }}
      className="space-y-4"
      noValidate={false}
    >
      <input type="hidden" name="tz" value={tz} />
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) =>
        f.choices ? (
          <fieldset key={f.name} className="space-y-1.5">
            <legend className="label mb-1.5 block">{f.label}</legend>
            <div className={`grid gap-2 ${f.choices.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
              {f.choices.map((c) => (
                <label key={c.value} className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-ink-2 px-3 py-2.5 text-sm has-[:checked]:border-lime/70 has-[:checked]:text-bone">
                  <input type="radio" name={f.name} value={c.value} required defaultChecked={f.defaultValue === c.value} className="accent-lime" />
                  {c.label}
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
        <div key={f.name} className="space-y-1.5">
          <label htmlFor={`f-${f.name}`} className="label block">
            {f.label}
          </label>
          {f.prefix ? (
            <div className="flex items-stretch overflow-hidden rounded-md border border-line bg-ink-2 focus-within:border-lime/70">
              <span className="flex items-center pl-3 text-sm text-mute">{f.prefix}</span>
              <input
                id={`f-${f.name}`}
                name={f.name}
                required
                defaultValue={f.defaultValue}
                placeholder={f.placeholder}
                autoComplete={f.autoComplete}
                autoCapitalize="none"
                className="w-full bg-transparent py-2.5 pr-3 text-sm outline-none placeholder:text-dim"
              />
            </div>
          ) : f.type === "password" ? (
            <div className="relative">
              <input
                id={`f-${f.name}`}
                className="input pr-12"
                name={f.name}
                type={shown[f.name] ? "text" : "password"}
                required
                minLength={f.minLength}
                defaultValue={f.defaultValue}
                placeholder={f.placeholder}
                autoComplete={f.autoComplete}
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
              className="input"
              name={f.name}
              type={f.type || "text"}
              required
              minLength={f.minLength}
              defaultValue={f.defaultValue}
              placeholder={f.placeholder}
              autoComplete={f.autoComplete}
            />
          )}
          {f.strength && <PasswordStrength value={values[f.name] ?? ""} context={["name", "email", "handle"].map((k) => values[k] ?? "")} />}
          {f.hint && <div className="text-sm text-mute">{f.hint}</div>}
        </div>
        ),
      )}
      {consents?.map((c) => (
        <label key={c.name} className="flex items-start gap-3 text-sm text-mute">
          <input type="checkbox" name={c.name} required={c.required} className="mt-0.5 size-4 shrink-0 accent-lime" />
          <span>{c.label}</span>
        </label>
      ))}
      {state?.error && (
        <p role="alert" className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.error}
        </p>
      )}
      {captureSource && <SourceField />}
      <Turnstile siteKey={botCheckKey ?? null} />
      <button className="btn-lime w-full" disabled={pending}>
        {pending ? "One moment…" : submit}
      </button>
      {footer && (
        <p className="text-center text-sm text-mute">
          {footer.text}{" "}
          <Link href={footer.href} className="text-bone underline decoration-lime underline-offset-4">
            {footer.link}
          </Link>
        </p>
      )}
    </form>
  );
}
