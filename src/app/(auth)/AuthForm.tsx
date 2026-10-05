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
                {shown[f.name] ? <NavIcon name="eyeOff" className="size-[18px]" /> : <EyeIcon />}
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

/** "Show password" eye, exported from the FloorTest Product System Figma file. */
function EyeIcon() {
  return (
    <svg aria-hidden viewBox="0 40.5 19 13" fill="none" className="h-[13px] w-[19px]">
      <path d="M9.5 41.25C11.3776 41.25 13.2118 41.7952 14.7695 42.8145C16.3199 43.8289 17.5257 45.2669 18.2393 46.9453C18.2522 46.9808 18.252 47.0182 18.2393 47.0537C17.5257 48.7325 16.3201 50.171 14.7695 51.1855C13.2118 52.2048 11.3776 52.75 9.5 52.75C7.62238 52.75 5.78822 52.2048 4.23047 51.1855C2.67979 50.1709 1.47329 48.7327 0.759766 47.0537C0.747138 47.0183 0.74693 46.9806 0.759766 46.9453C1.47333 45.2667 2.68004 43.8289 4.23047 42.8145C5.78822 41.7952 7.62238 41.25 9.5 41.25ZM11.6006 47C11.6004 48.1083 10.6757 49.0352 9.5 49.0352C8.32449 49.0349 7.40058 48.1082 7.40039 47C7.40039 45.8917 8.32437 44.9641 9.5 44.9639C10.6758 44.9639 11.6006 45.8915 11.6006 47ZM13.1006 47C13.1006 45.0312 11.472 43.4639 9.5 43.4639C7.52818 43.4641 5.90039 45.0314 5.90039 47C5.90058 48.9685 7.52829 50.5349 9.5 50.5352C11.4719 50.5352 13.1004 48.9686 13.1006 47Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}
