"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { FormState } from "./actions";

type Field = { name: string; label: string; type?: string; placeholder?: string; prefix?: string; autoComplete?: string };

export function AuthForm({
  action,
  fields,
  submit,
  footer,
  hidden,
}: {
  action: (s: FormState, f: FormData) => Promise<FormState>;
  fields: Field[];
  submit: string;
  footer: { text: string; href: string; link: string };
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  return (
    <form action={formAction} className="space-y-4">
      {Object.entries(hidden ?? {}).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {fields.map((f) => (
        <label key={f.name} className="block space-y-1.5">
          <span className="label">{f.label}</span>
          {f.prefix ? (
            <div className="flex items-stretch overflow-hidden rounded-md border border-line bg-ink-2 focus-within:border-lime/70">
              <span className="flex items-center pl-3 text-sm text-mute">{f.prefix}</span>
              <input
                name={f.name}
                required
                placeholder={f.placeholder}
                autoComplete={f.autoComplete}
                className="w-full bg-transparent py-2.5 pr-3 text-sm outline-none placeholder:text-dim"
              />
            </div>
          ) : (
            <input className="input" name={f.name} type={f.type || "text"} required placeholder={f.placeholder} autoComplete={f.autoComplete} />
          )}
        </label>
      ))}
      {state?.error && <p className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{state.error}</p>}
      <button className="btn-lime w-full" disabled={pending}>
        {pending ? "One moment…" : submit}
      </button>
      <p className="text-center text-sm text-mute">
        {footer.text}{" "}
        <Link href={footer.href} className="text-bone underline decoration-lime underline-offset-4">
          {footer.link}
        </Link>
      </p>
    </form>
  );
}
